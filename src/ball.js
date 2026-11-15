// A bola squishie: malha deformável + física simples.
//
// Camadas de deformação (somadas a cada quadro sobre a esfera em repouso):
//  1. Ondas na superfície: cada vértice tem um deslocamento radial com mola,
//     ligado aos vizinhos (equação de onda discreta). Batidas e apertos
//     "cutucam" a superfície e as ondas se espalham pela bola.
//  2. Afundamento das mãos + bojo em volta (o material empurrado sobe ao redor).
//  3. Achatamento com conservação de volume ao longo do eixo do aperto.
//  4. Balanço de gelatina num eixo perpendicular, disparado ao soltar.
//  5. Achatamento de impacto (chão ou parede).
//  6. Esticar na direção do movimento quando a bola anda rápido.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const RADIUS = 1;
export const ARENA = 3.2; // distância máxima do centro da bola até a origem

const GRAVITY = 9.8;
const MAX_SQUEEZE = 0.32;
const MAX_DENT = 0.3;
const MAX_SPEED = 7;

// Ondas: rigidez entre vizinhos, mola de volta à forma e amortecimento.
const WAVE_K = 9000;
const WAVE_REST = 70;
const WAVE_DAMP = 3.2;
const WAVE_MAX = 0.22;

function makeSpring(k, c, limit = 0.4) {
  return { x: 0, v: 0, target: 0, k, c, limit };
}
function stepSpring(s, dt) {
  s.v += (s.k * (s.target - s.x) - s.c * s.v) * dt;
  s.x += s.v * dt;
  if (s.x > s.limit || s.x < -s.limit) {
    s.x = Math.sign(s.x) * s.limit;
    s.v *= -0.3;
  }
}

// Achatamento com volume conservado ao longo de "axis" (unitário).
// amount > 0 achata; amount < 0 estica.
function squash(p, axis, amount) {
  if (Math.abs(amount) < 1e-5) return;
  amount = Math.max(-0.4, Math.min(0.45, amount)); // nunca deforma demais
  const along = 1 - amount;
  const perp = 1 / Math.sqrt(Math.max(along, 0.05));
  const d = p.dot(axis);
  p.multiplyScalar(perp).addScaledVector(axis, d * (along - perp));
}

// Perfil do afundamento (c = cosseno do ângulo até o ponto apertado).
const dentProfile = (c) => Math.exp((c - 1) / 0.12);
// Anel de material empurrado para fora em volta das mãos.
const bulgeProfile = (c) => Math.exp(-((c - 0.62) * (c - 0.62)) / 0.025);

export function createBall() {
  // ---------------- Malha ----------------
  let geometry = new THREE.IcosahedronGeometry(RADIUS, 28);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry); // vértices compartilhados => normais suaves
  geometry.computeVertexNormals();

  const posAttr = geometry.attributes.position;
  const N = posAttr.count;
  const rest = Float32Array.from(posAttr.array);
  const restDir = new Float32Array(N * 3); // direção unitária de cada vértice
  for (let i = 0; i < N * 3; i += 3) {
    const l = Math.hypot(rest[i], rest[i + 1], rest[i + 2]);
    restDir[i] = rest[i] / l;
    restDir[i + 1] = rest[i + 1] / l;
    restDir[i + 2] = rest[i + 2] / l;
  }

  // Vizinhos de cada vértice (formato CSR) a partir dos triângulos.
  const index = geometry.index.array;
  const sets = Array.from({ length: N }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const nbrStart = new Uint32Array(N + 1);
  for (let i = 0; i < N; i++) nbrStart[i + 1] = nbrStart[i] + sets[i].size;
  const nbrs = new Uint32Array(nbrStart[N]);
  for (let i = 0; i < N; i++) nbrs.set([...sets[i]], nbrStart[i]);

  const wave = new Float32Array(N); // deslocamento radial (fração do raio)
  const waveV = new Float32Array(N);

  // ---------------- Material ----------------
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x4f8cff,
    roughness: 0.4,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xbcd4ff),
  });
  const colors = {
    rest: new THREE.Color(0x4f8cff),
    pressed: new THREE.Color(0xff4fa3),
    sheenRest: new THREE.Color(0xbcd4ff),
    sheenPressed: new THREE.Color(0xffc2e0),
  };
  let colorT = 0;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.position.y = RADIUS;

  // ---------------- Estado físico ----------------
  const pos = new THREE.Vector3(0, RADIUS, 0);
  const vel = new THREE.Vector3();
  const squeeze = makeSpring(160, 12);
  const dent = makeSpring(200, 14);
  const wobble = makeSpring(190, 2.6);
  const impact = makeSpring(260, 7);
  const impactAxis = new THREE.Vector3(0, 1, 0);
  const wobbleAxis = new THREE.Vector3(1, 0, 0);
  const stretchDir = new THREE.Vector3(1, 0, 0);
  let stretch = 0;
  let spin = 0.3;
  let lastMinY = -RADIUS;
  let onFloor = true;

  const press = {
    active: false,
    time: 0,
    dir: new THREE.Vector3(0, 0, 1), // direção (mundo) do ponto apertado, a partir do centro
    holdTarget: null, // ponto (mundo) para onde as mãos estão puxando a bola
  };

  const api = { mesh, press, pos, vel, onImpact: null };

  // Cutuca a superfície em volta de uma direção (mundo): inicia ondas.
  const _kickLocal = new THREE.Vector3();
  const _inv = new THREE.Quaternion();
  function kick(dirWorld, strength, width = 0.15) {
    _inv.copy(mesh.quaternion).invert();
    _kickLocal.copy(dirWorld).applyQuaternion(_inv).normalize();
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const c = restDir[j] * _kickLocal.x + restDir[j + 1] * _kickLocal.y + restDir[j + 2] * _kickLocal.z;
      const w = Math.exp((c - 1) / width);
      if (w > 0.01) waveV[i] += strength * w;
    }
  }

  let lastHit = 0;
  let clock = 0;
  function hit(normalWorld, speed) {
    if (clock - lastHit < 0.08) return; // evita acumular batidas seguidas
    lastHit = clock;
    impactAxis.copy(normalWorld);
    impact.v += Math.min(speed, 6) * 1.3;
    kick(normalWorld.clone().negate(), -Math.min(speed, 6) * 0.9, 0.2);
    api.onImpact?.(speed);
  }

  api.grab = (dirWorld) => {
    press.active = true;
    press.time = 0;
    press.dir.copy(dirWorld);
    kick(dirWorld, -1.6, 0.1);
  };

  api.release = () => {
    if (!press.active) return 0;
    const energy = squeeze.x / MAX_SQUEEZE;
    vel.y += 3.5 * squeeze.x; // a energia do aperto faz a bola pular
    // balanço de gelatina num eixo perpendicular ao aperto
    wobbleAxis.copy(press.dir).cross(Math.abs(press.dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    wobble.v += squeeze.x * 5;
    kick(press.dir, dent.x * 9, 0.14); // o afundamento "estoura" para fora
    press.active = false;
    press.holdTarget = null;
    if (vel.length() > MAX_SPEED) vel.setLength(MAX_SPEED);
    return energy;
  };

  api.setColors = (c) => {
    colors.rest.set(c.rest);
    colors.pressed.set(c.pressed);
    colors.sheenRest.set(c.sheenRest);
    colors.sheenPressed.set(c.sheenPressed);
  };

  api.reset = () => {
    pos.set(0, RADIUS + 0.6, 0);
    vel.set(0, 0, 0);
    wave.fill(0);
    waveV.fill(0);
    press.active = false;
    press.holdTarget = null;
  };

  // ---------------- Passo de física ----------------
  const _f = new THREE.Vector3();
  const _n = new THREE.Vector3();
  function step(dt) {
    clock += dt;
    if (press.active) {
      press.time += dt;
      squeeze.target = MAX_SQUEEZE * (1 - Math.exp(-press.time / 0.9));
      dent.target = MAX_DENT * (1 - Math.exp(-press.time / 0.6));
      squeeze.k = 160; squeeze.c = 12;
      dent.k = 200; dent.c = 14;
    } else {
      squeeze.target = 0;
      dent.target = 0;
      squeeze.k = 220; squeeze.c = 3.5; // pouco amortecida => balança
      dent.k = 260; dent.c = 5;
    }
    stepSpring(squeeze, dt);
    stepSpring(dent, dt);
    stepSpring(wobble, dt);
    stepSpring(impact, dt);

    // Ondas na superfície (Euler semi-implícito: velocidades, depois posições).
    for (let i = 0; i < N; i++) {
      let sum = 0;
      const s = nbrStart[i], e = nbrStart[i + 1];
      for (let k = s; k < e; k++) sum += wave[nbrs[k]];
      const lap = sum / (e - s) - wave[i];
      waveV[i] += (WAVE_K * lap - WAVE_REST * wave[i] - WAVE_DAMP * waveV[i]) * dt;
    }
    for (let i = 0; i < N; i++) {
      const w = wave[i] + waveV[i] * dt;
      wave[i] = w > WAVE_MAX ? WAVE_MAX : w < -WAVE_MAX ? -WAVE_MAX : w;
    }

    // Mãos segurando: a bola é puxada (com atraso) para onde as mãos vão.
    if (press.active && press.holdTarget) {
      // alvo limitado à área de brincar: as mãos não empurram a bola contra a parede
      let tx = press.holdTarget.x, tz = press.holdTarget.z;
      const td = Math.hypot(tx, tz);
      if (td > ARENA) { tx *= ARENA / td; tz *= ARENA / td; }
      _f.set(tx - pos.x, 0, tz - pos.z).multiplyScalar(70);
      _f.x -= vel.x * 11;
      _f.z -= vel.z * 11;
      vel.addScaledVector(_f, dt);
    }

    // Gravidade e movimento.
    vel.y -= GRAVITY * dt;
    pos.addScaledVector(vel, dt);

    // Chão.
    const contactY = -lastMinY;
    onFloor = pos.y <= contactY + 0.002;
    if (pos.y <= contactY) {
      const hitSpeed = -vel.y;
      pos.y = contactY;
      if (hitSpeed > 0.8) {
        vel.y = hitSpeed * 0.42;
        hit(_n.set(0, 1, 0), hitSpeed);
      } else {
        vel.y = 0;
      }
      // atrito de rolamento
      const fr = Math.exp(-0.9 * dt);
      vel.x *= fr;
      vel.z *= fr;
    }

    // Paredes invisíveis (círculo).
    const d = Math.hypot(pos.x, pos.z);
    if (d > ARENA) {
      _n.set(pos.x / d, 0, pos.z / d);
      pos.x = _n.x * ARENA;
      pos.z = _n.z * ARENA;
      const vn = vel.dot(_n);
      if (vn > 0) {
        vel.addScaledVector(_n, -vn * 1.55); // devolve ~55% da velocidade
        if (vn > 0.8) hit(_n.clone().negate(), vn);
      }
    }

    // Rolar no chão: gira de acordo com o deslocamento.
    const vxz = Math.hypot(vel.x, vel.z);
    if (onFloor && vxz > 1e-3) {
      _n.set(vel.z, 0, -vel.x).normalize(); // eixo = cima x velocidade
      mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_n, (vxz * dt) / RADIUS));
    }
    // giro automático quando parada e solta
    const idle = !press.active && vxz < 0.05;
    spin += ((idle ? 0.3 : 0) - spin) * Math.min(1, dt * 3);
    mesh.rotateY(spin * dt);

    // Esticar com a velocidade (suavizado).
    const speed = vel.length();
    const targetStretch = Math.min(0.16, speed * 0.022);
    stretch += (targetStretch - stretch) * Math.min(1, dt * 10);
    if (speed > 0.2) stretchDir.lerp(_n.copy(vel).divideScalar(speed), Math.min(1, dt * 12)).normalize();
  }

  // ---------------- Malha deformada ----------------
  const _v = new THREE.Vector3();
  const _press = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _imp = new THREE.Vector3();
  const _wob = new THREE.Vector3();
  const _str = new THREE.Vector3();
  function deform() {
    _inv.copy(mesh.quaternion).invert();
    _press.copy(press.dir).applyQuaternion(_inv).normalize();
    _up.set(0, 1, 0).applyQuaternion(_inv);
    _imp.copy(impactAxis).applyQuaternion(_inv);
    _wob.copy(wobbleAxis).applyQuaternion(_inv);
    _str.copy(stretchDir).applyQuaternion(_inv);

    const arr = posAttr.array;
    const dn = dent.x;
    const sq = squeeze.x;
    let minY = Infinity;
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const dx = restDir[j], dy = restDir[j + 1], dz = restDir[j + 2];
      let r = RADIUS * (1 + wave[i]);
      if (dn > 1e-4 || dn < -1e-4) {
        const c = dx * _press.x + dy * _press.y + dz * _press.z;
        r *= 1 - dn * dentProfile(c) + dn * 0.28 * bulgeProfile(c);
      }
      _v.set(dx * r, dy * r, dz * r);
      squash(_v, _press, sq);
      squash(_v, _wob, wobble.x);
      squash(_v, _imp, impact.x);
      squash(_v, _str, -stretch);
      arr[j] = _v.x;
      arr[j + 1] = _v.y;
      arr[j + 2] = _v.z;
      const wy = _v.dot(_up);
      if (wy < minY) minY = wy;
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    lastMinY = minY;
  }

  api.update = (frameDt) => {
    const steps = Math.max(2, Math.ceil(frameDt / (1 / 240)));
    for (let i = 0; i < steps; i++) step(frameDt / steps);
    deform();
    mesh.position.copy(pos);

    const target = THREE.MathUtils.clamp(squeeze.x / MAX_SQUEEZE, 0, 1);
    colorT += (target - colorT) * Math.min(1, frameDt * 6);
    material.color.copy(colors.rest).lerpHSL(colors.pressed, colorT);
    material.sheenColor.copy(colors.sheenRest).lerpHSL(colors.sheenPressed, colorT);
  };

  api.squeezeAmount = () => squeeze.x / MAX_SQUEEZE;
  return api;
}
