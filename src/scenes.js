// Cenários: Brasil (praia) e Canadá (inverno).
// Tudo é feito com geometria simples do Three.js — sem modelos externos.
import * as THREE from 'three';

// Gerador pseudoaleatório com semente: o cenário sai igual em toda visita.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Céu em degradê (esfera grande vista por dentro).
function makeSky(top, horizon) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
      void main() { float t = smoothstep(-0.05, 0.6, vDir.y); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), mat);
  sky.renderOrder = -1;
  return sky;
}

// Textura de chão com granulado leve (areia / neve).
function grainTexture(base, speck, amount, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    g.fillStyle = speck;
    g.globalAlpha = 0.15 + r() * 0.35;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Brasil: praia, mar, coqueiros, morros ao fundo
// ---------------------------------------------------------------------------
function leafGeometry() {
  const g = new THREE.PlaneGeometry(0.42, 2.1, 1, 8);
  g.translate(0, 1.05, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / 2.1;
    p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05))); // afina nas pontas
    p.setZ(i, -t * t * 1.3); // curva para baixo
  }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function palm(x, z, height, leanDir, r) {
  const group = new THREE.Group();
  const trunkMat = std(0x9a6b3f);
  const segs = 9;
  const lean = 0.9 + r() * 0.6;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3(Math.cos(leanDir) * lean * t * t, height * t, Math.sin(leanDir) * lean * t * t);
    const len = p.distanceTo(prev);
    const seg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.11 - t * 0.04, 0.14 - t * 0.04, len * 1.05, 8), trunkMat));
    seg.position.copy(prev).lerp(p, 0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize());
    group.add(seg);
    prev = p;
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e9e4f, roughness: 0.8, side: THREE.DoubleSide });
  const lg = leafGeometry();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const leaf = shadowed(new THREE.Mesh(lg, leafMat));
    leaf.position.copy(prev);
    leaf.rotation.y = (i / n) * Math.PI * 2 + r() * 0.3;
    leaf.rotateX(0.25 + r() * 0.25);
    group.add(leaf);
  }
  const nutMat = std(0x5a3a1c);
  for (let i = 0; i < 3; i++) {
    const nut = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), nutMat));
    const a = (i / 3) * Math.PI * 2;
    nut.position.set(prev.x + Math.cos(a) * 0.14, prev.y - 0.12, prev.z + Math.sin(a) * 0.14);
    group.add(nut);
  }
  group.position.set(x, 0, z);
  return group;
}

function buildBrasil() {
  const g = new THREE.Group();
  const r = rng(7);
  g.add(makeSky(0x2d8fe0, 0xcdeeff));

  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: grainTexture('#f0d39c', '#b98d52', 2500, 3), roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  g.add(sand);

  // Mar atrás da bola (na direção -z), com espuma na beira.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 60),
    new THREE.MeshStandardMaterial({ color: 0x17a6c4, roughness: 0.25, metalness: 0.1 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, -38);
  g.add(sea);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.85 })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.03, -8);
  g.add(foam);

  // Sol e nuvens (fora da neblina).
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff2a8, fog: false }));
  sun.position.set(-26, 22, -60);
  g.add(sun);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false, emissive: 0x9fb8c8, emissiveIntensity: 0.4 });
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.4 + r() * 1.2, 14, 10), cloudMat);
      puff.position.set(j * 1.8 - 2.7, r() * 0.8, r() * 0.8);
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    const a = -Math.PI * 0.15 - r() * Math.PI * 0.7;
    cloud.position.set(Math.cos(a) * 55, 14 + r() * 10, Math.sin(a) * 55);
    cloud.lookAt(0, cloud.position.y, 0);
    g.add(cloud);
  }

  // Morros verdes ao fundo (inspirados no Pão de Açúcar).
  const hillMat = std(0x3d8a55);
  [[18, -52, 9, 13], [27, -48, 6, 8], [-34, -55, 10, 9], [-46, -40, 8, 6]].forEach(([x, z, rad, h]) => {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), hillMat);
    hill.scale.set(rad * 0.75, h, rad * 0.75);
    hill.position.set(x, 0, z);
    g.add(hill);
  });

  // Coqueiros em volta da área de brincar.
  [[-4.6, -3.2, 4.2, 2.6], [5.0, -2.6, 3.8, 0.4], [-6.4, 2.2, 4.6, 3.4], [6.6, 3.0, 4.0, -0.3], [-1.8, -6.2, 5.0, 1.8]].forEach(
    ([x, z, h, dir]) => g.add(palm(x, z, h, dir, r))
  );

  // Conchas / pedrinhas na areia.
  const shellMat = std(0xfbe3d4);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const d = 4 + r() * 6;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06 + r() * 0.06, 8, 6), shellMat);
    s.scale.y = 0.5;
    s.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
    g.add(s);
  }

  return {
    group: g,
    fog: { color: 0xcdeeff, near: 30, far: 130 },
    hemi: { sky: 0xd6ecff, ground: 0xe7c58f, intensity: 1.0 },
    sun: { color: 0xfff0d0, intensity: 2.6, position: [-3, 7, -4] },
    ball: { rest: 0xffd23f, pressed: 0x1fae5b, sheenRest: 0xfff1b0, sheenPressed: 0xb6f5cf },
    update(dt, t) {
      foam.position.z = -8 + Math.sin(t * 0.8) * 0.35;
      foam.material.opacity = 0.6 + Math.sin(t * 0.8 + 1) * 0.25;
    },
  };
}

// ---------------------------------------------------------------------------
// Canadá: neve, pinheiros, montanhas e flocos caindo
// ---------------------------------------------------------------------------
function pine(x, z, h, r) {
  const group = new THREE.Group();
  const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h * 0.25, 8), std(0x6b4423)));
  trunk.position.y = h * 0.125;
  group.add(trunk);
  const green = std(0x1f5f3a);
  const snow = std(0xf7fbff);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rad = (0.95 - t * 0.55) * h * 0.32;
    const th = h * 0.42;
    const y = h * 0.2 + t * h * 0.27 + th / 2;
    const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(rad, th, 9), green));
    cone.position.y = y;
    cone.rotation.y = r() * Math.PI;
    group.add(cone);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.55, th * 0.42, 9), snow);
    cap.position.y = y + th * 0.3;
    cap.rotation.y = cone.rotation.y;
    group.add(cap);
  }
  group.position.set(x, 0, z);
  return group;
}

function snowman(x, z) {
  const g = new THREE.Group();
  const white = std(0xffffff, { roughness: 0.7 });
  [[0.55, 0.5], [0.4, 1.28], [0.3, 1.86]].forEach(([rad, y]) => {
    const s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(rad, 20, 14), white));
    s.position.y = y;
    g.add(s);
  });
  const dark = std(0x1b1030);
  [[-0.1, 1.93], [0.1, 1.93], [0, 1.4], [0, 1.2]].forEach(([dx, y]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), dark);
    e.position.set(dx, y, y > 1.5 ? 0.27 : 0.39);
    g.add(e);
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), std(0xff8c1a));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.84, 0.4);
  g.add(nose);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 20), std(0xd62828));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.6;
  g.add(scarf);
  g.position.set(x, 0, z);
  g.rotation.y = -0.6;
  return g;
}

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function buildCanada() {
  const g = new THREE.Group();
  const r = rng(11);
  g.add(makeSky(0x5b8fd0, 0xe4eef8));

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: grainTexture('#f2f6fc', '#b9c9de', 1800, 5), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // Montanhas com pico nevado.
  const rock = std(0x7d8ea6);
  const capMat = std(0xffffff);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    const d = 42 + r() * 10;
    const h = 12 + r() * 10;
    const rad = 9 + r() * 6;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), rock);
    m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    g.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.36, h * 0.36, 7), capMat);
    cap.position.set(m.position.x, h - h * 0.18 + 0.05, m.position.z);
    g.add(cap);
  }

  // Pinheiros em anéis (fora da área de brincar).
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const d = 5.2 + r() * 12;
    g.add(pine(Math.cos(a) * d, Math.sin(a) * d, 2.4 + r() * 2.6, r));
  }
  g.add(snowman(4.2, -2.6));

  // Montinhos de neve.
  const moundMat = std(0xf7fbff);
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2;
    const d = 4.5 + r() * 8;
    const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.6 + r() * 0.8, 16, 10), moundMat));
    m.scale.y = 0.35;
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    g.add(m);
  }

  // Neve caindo.
  const COUNT = 1400;
  const pos = new Float32Array(COUNT * 3);
  const speed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (r() - 0.5) * 30;
    pos[i * 3 + 1] = r() * 14;
    pos[i * 3 + 2] = (r() - 0.5) * 30;
    speed[i] = 0.5 + r() * 0.8;
  }
  const flakesGeo = new THREE.BufferGeometry();
  flakesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const flakes = new THREE.Points(
    flakesGeo,
    new THREE.PointsMaterial({ size: 0.09, map: flakeTexture(), transparent: true, depthWrite: false, color: 0xffffff })
  );
  flakes.frustumCulled = false;
  g.add(flakes);

  return {
    group: g,
    fog: { color: 0xe4eef8, near: 12, far: 60 },
    hemi: { sky: 0xdbe9ff, ground: 0xb8c6d9, intensity: 1.1 },
    sun: { color: 0xe8f0ff, intensity: 1.7, position: [3, 7, 4] },
    ball: { rest: 0xe63946, pressed: 0xfff0f0, sheenRest: 0xffd0d0, sheenPressed: 0xffffff },
    update(dt, t) {
      for (let i = 0; i < COUNT; i++) {
        let y = pos[i * 3 + 1] - speed[i] * dt;
        if (y < 0) y += 14;
        pos[i * 3 + 1] = y;
        pos[i * 3] += Math.sin(t * 0.9 + i) * 0.15 * dt;
      }
      flakesGeo.attributes.position.needsUpdate = true;
    },
  };
}

const BUILDERS = { brasil: buildBrasil, canada: buildCanada };

// Controla qual cenário está ativo e ajusta luzes, neblina e cores da bola.
export function createScenery(scene, { hemi, sun }) {
  const built = {};
  let current = null;

  function set(id) {
    if (!BUILDERS[id]) id = 'brasil';
    if (!built[id]) {
      built[id] = BUILDERS[id]();
      scene.add(built[id].group);
    }
    for (const [key, s] of Object.entries(built)) s.group.visible = key === id;
    current = built[id];
    scene.fog = new THREE.Fog(current.fog.color, current.fog.near, current.fog.far);
    scene.background = new THREE.Color(current.fog.color);
    hemi.color.set(current.hemi.sky);
    hemi.groundColor.set(current.hemi.ground);
    hemi.intensity = current.hemi.intensity;
    sun.color.set(current.sun.color);
    sun.intensity = current.sun.intensity;
    sun.position.set(...current.sun.position);
    return current;
  }

  return {
    set,
    get current() {
      return current;
    },
    update(dt, t) {
      current?.update(dt, t);
    },
  };
}
