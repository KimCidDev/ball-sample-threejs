import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { initUI, CHARACTERS } from './ui.js';

// ---------------------------------------------------------------------------
// Cena, câmera e renderizador
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);
scene.fog = new THREE.Fog(0x0e1116, 8, 18);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 4.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Ambiente: chão + luzes
// ---------------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20242c, 0.6));
const light = new THREE.DirectionalLight(0xffffff, 2.2);
light.position.set(3, 6, 4);
light.castShadow = true;
light.shadow.mapSize.set(1024, 1024);
light.shadow.camera.left = -3;
light.shadow.camera.right = 3;
light.shadow.camera.top = 3;
light.shadow.camera.bottom = -3;
light.shadow.radius = 6;
scene.add(light);

// ---------------------------------------------------------------------------
// Bola squishie (malha deformável)
// ---------------------------------------------------------------------------
const RADIUS = 1;
let geometry = new THREE.IcosahedronGeometry(RADIUS, 32);
geometry.deleteAttribute('normal');
geometry.deleteAttribute('uv');
geometry = mergeVertices(geometry); // vértices compartilhados => normais suaves
geometry.computeVertexNormals();

const posAttr = geometry.attributes.position;
const restPositions = Float32Array.from(posAttr.array); // forma original (esfera)

const material = new THREE.MeshPhysicalMaterial({
  color: 0x4f8cff,
  roughness: 0.45,
  metalness: 0.0,
  clearcoat: 0.6,
  clearcoatRoughness: 0.35,
  sheen: 0.6,
  sheenColor: new THREE.Color(0xbcd4ff),
});
// Cores do jogo: azul em repouso -> rosa quando apertada ao máximo.
const BALL_BLUE = new THREE.Color(0x4f8cff);
const BALL_PINK = new THREE.Color(0xff4fa3);
const SHEEN_BLUE = new THREE.Color(0xbcd4ff);
const SHEEN_PINK = new THREE.Color(0xffc2e0);
let colorT = 0;

function updateBallColor(dt) {
  // acompanha o aperto (e volta suavemente para o azul ao soltar)
  const target = THREE.MathUtils.clamp(squeeze.x / MAX_SQUEEZE, 0, 1);
  colorT += (target - colorT) * Math.min(1, dt * 6);
  material.color.copy(BALL_BLUE).lerpHSL(BALL_PINK, colorT);
  material.sheenColor.copy(SHEEN_BLUE).lerpHSL(SHEEN_PINK, colorT);
}

const ball = new THREE.Mesh(geometry, material);
ball.castShadow = true;
ball.position.y = RADIUS;
scene.add(ball);

// ---------------------------------------------------------------------------
// Física
// ---------------------------------------------------------------------------
const GRAVITY = 9.8;

// Mola amortecida 1D: usada para cada canal de deformação.
function makeSpring(stiffness, damping) {
  return { x: 0, v: 0, target: 0, k: stiffness, c: damping };
}
function stepSpring(s, dt) {
  const a = s.k * (s.target - s.x) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

// Aperto (achatamento ao longo do eixo da pressão) e afundamento local (dedos).
const squeeze = makeSpring(160, 9);
const dent = makeSpring(200, 10);
// Achatamento vertical quando a bola bate no chão.
const impact = makeSpring(260, 7);

const body = { y: RADIUS, vy: 0 };
let spin = 0.005; // rotação automática (diminui enquanto apertada)

// Estado da pressão
const press = {
  active: false,
  time: 0,
  dirWorld: new THREE.Vector3(0, 0, 1), // direção (a partir do centro) do ponto apertado
};

const MAX_SQUEEZE = 0.32; // achatamento máximo
const MAX_DENT = 0.3; // profundidade máxima do afundamento das mãos

const _v = new THREE.Vector3();
const _axisLocal = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _upLocal = new THREE.Vector3();

// Aplica achatamento com conservação de volume ao longo de "axis" (unitário).
function squash(p, axis, amount) {
  if (Math.abs(amount) < 1e-5) return;
  const along = 1 - amount;
  const perp = 1 / Math.sqrt(Math.max(along, 0.05));
  const d = p.dot(axis);
  // p = componente axial * along + componente perpendicular * perp
  p.multiplyScalar(perp).addScaledVector(axis, d * (along - perp));
}

function deformBall() {
  _invQuat.copy(ball.quaternion).invert();
  _axisLocal.copy(press.dirWorld).applyQuaternion(_invQuat).normalize();
  _upLocal.copy(_up).applyQuaternion(_invQuat).normalize();

  const arr = posAttr.array;
  const dentAmt = dent.x;
  const sq = squeeze.x;
  const im = impact.x;
  const sigma2 = 0.12; // largura do afundamento
  let minY = Infinity;

  for (let i = 0; i < arr.length; i += 3) {
    _v.set(restPositions[i], restPositions[i + 1], restPositions[i + 2]);

    // afundamento gaussiano em volta do ponto apertado
    if (dentAmt > 1e-4 || dentAmt < -1e-4) {
      const c = _v.dot(_axisLocal) / RADIUS; // cos do ângulo até o ponto apertado
      const w = Math.exp((c - 1) / sigma2);
      _v.multiplyScalar(1 - dentAmt * w);
    }
    squash(_v, _axisLocal, sq);
    squash(_v, _upLocal, im);

    arr[i] = _v.x;
    arr[i + 1] = _v.y;
    arr[i + 2] = _v.z;

    // menor altura (no espaço do mundo, relativa ao centro) p/ colisão com o chão
    const wy = _v.dot(_upLocal);
    if (wy < minY) minY = wy;
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return minY;
}

let lastMinY = -RADIUS;

function stepPhysics(dt) {
  // Alvos de deformação: quanto mais tempo segurando, mais aperta.
  if (press.active) {
    press.time += dt;
    squeeze.target = MAX_SQUEEZE * (1 - Math.exp(-press.time / 0.9));
    dent.target = MAX_DENT * (1 - Math.exp(-press.time / 0.6));
    squeeze.k = 160; squeeze.c = 12;
    dent.k = 200; dent.c = 14;
  } else {
    squeeze.target = 0;
    dent.target = 0;
    // soltar => mola pouco amortecida = balança como gelatina
    squeeze.k = 220; squeeze.c = 3.5;
    dent.k = 260; dent.c = 5;
  }
  impact.target = 0;

  stepSpring(squeeze, dt);
  stepSpring(dent, dt);
  stepSpring(impact, dt);

  spin += ((press.active ? 0 : 0.005) - spin) * Math.min(1, dt * 4);
  ball.rotation.y += spin * dt * 60;

  // Gravidade + chão
  body.vy -= GRAVITY * dt;
  body.y += body.vy * dt;

  const contactY = -lastMinY; // altura do centro em que a base encosta no chão
  if (body.y <= contactY) {
    const hitSpeed = -body.vy;
    body.y = contactY;
    if (hitSpeed > 0.6) {
      body.vy = hitSpeed * 0.35; // quica
      impact.v += hitSpeed * 1.4; // achata ao bater
    } else {
      body.vy = 0;
    }
  }
  ball.position.y = body.y;
}

// ---------------------------------------------------------------------------
// Controles de órbita (arrastar fora da bola gira a câmera — só no desktop)
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.5;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
// No menu a câmera gira sozinha ao redor da bola.
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.enabled = false;

let playing = false;

// ---------------------------------------------------------------------------
// Cursor: a menina
// ---------------------------------------------------------------------------
const CURSOR_W = 150; // largura exibida (PNG em 2x: 300x360)
const HOTSPOT_X = 75; // ponto entre as mãos
const HOTSPOT_Y = 30;
const BODY_OFFSET = 95; // distância do ponto das mãos até o centro do corpo

const imgOpen = new Image();
const imgClosed = new Image();
function setCharacterImages(character) {
  imgOpen.src = character.open;
  imgClosed.src = character.closed;
}
setCharacterImages(CHARACTERS.mama);

const cursorEl = document.createElement('img');
cursorEl.id = 'girl-cursor';
cursorEl.src = imgOpen.src;
cursorEl.alt = '';
cursorEl.draggable = false;
Object.assign(cursorEl.style, {
  width: `${CURSOR_W}px`,
  transformOrigin: `${HOTSPOT_X}px ${HOTSPOT_Y}px`,
});
document.body.appendChild(cursorEl);

const girl = {
  x: window.innerWidth / 2,
  y: window.innerHeight * 0.72,
  angle: 0,
  closed: false,
};

function setHands(closed) {
  if (girl.closed === closed) return;
  girl.closed = closed;
  cursorEl.src = closed ? imgClosed.src : imgOpen.src;
}

const _proj = new THREE.Vector3();
function ballScreenPos() {
  _proj.copy(ball.position).project(camera);
  return {
    x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function updateCursor(dt) {
  // As mãos (topo da imagem) sempre miram o centro da bola.
  const b = ballScreenPos();
  const dx = b.x - girl.x;
  const dy = b.y - girl.y;
  if (dx * dx + dy * dy > 64) {
    const target = Math.atan2(dx, -dy);
    let diff = target - girl.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // menor caminho
    girl.angle += diff * Math.min(1, dt * 14);
  }
  cursorEl.style.transform =
    `translate(${girl.x - HOTSPOT_X}px, ${girl.y - HOTSPOT_Y}px) rotate(${girl.angle}rad)`;
}

// Centro do corpo da menina na tela (para saber se o toque pegou nela).
function girlBodyCenter() {
  return {
    x: girl.x - Math.sin(girl.angle) * BODY_OFFSET,
    y: girl.y + Math.cos(girl.angle) * BODY_OFFSET,
  };
}

// ---------------------------------------------------------------------------
// Interação
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// Direção (no mundo) de onde a menina aperta: combina o ponto tocado com o lado
// da tela em que ela está, para o achatamento aparecer de frente para a câmera.
const _screenDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
function computePressDir(hitPoint, out) {
  const b = ballScreenPos();
  let sx = girl.x - b.x;
  let sy = -(girl.y - b.y);
  // se as mãos estão bem no centro, usa o lado de onde o corpo vem
  if (Math.hypot(sx, sy) < 12) {
    sx = Math.sin(girl.angle);
    sy = Math.cos(girl.angle);
  }
  camera.matrixWorld.extractBasis(_camRight, _camUp, _v);
  _screenDir.copy(_camRight).multiplyScalar(sx).addScaledVector(_camUp, sy).normalize();
  out.copy(hitPoint).sub(ball.position).normalize();
  // puxa a direção para a borda do lado da menina
  return out.multiplyScalar(0.6).addScaledVector(_screenDir, 1).normalize();
}

// Tenta "pegar" a bola no ponto das mãos da menina.
function raycastHands() {
  ndc.set((girl.x / window.innerWidth) * 2 - 1, -(girl.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(ball, false)[0];
}

function tryGrab() {
  const hit = raycastHands();
  if (!hit) return false;
  press.active = true;
  press.time = 0;
  computePressDir(hit.point, press.dirWorld);
  return true;
}

// Enquanto aperta, o ponto de pressão acompanha as mãos (suavemente).
const _newDir = new THREE.Vector3();
function followHands(dt) {
  if (!press.active) return;
  const hit = raycastHands();
  if (!hit) return;
  computePressDir(hit.point, _newDir);
  press.dirWorld.lerp(_newDir, Math.min(1, dt * 8)).normalize();
}

function release() {
  if (press.active) {
    // a energia acumulada no aperto faz a bola pular ao soltar
    body.vy += 3.5 * squeeze.x;
  }
  press.active = false;
}

// Desktop (mouse): a menina segue o mouse; clicar e segurar sobre a bola aperta.
// Mobile (toque): arrastar a menina leva ela até a bola; tocar/segurar em outro
// ponto da tela aperta a bola onde estão as mãos dela.
// Em telas de toque o navegador pode emitir eventos de "mouse" sintéticos;
// só tratamos como mouse quando o dispositivo realmente tem hover.
const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isMouse = (e) => e.pointerType === 'mouse' && hasHover;

let touchMode = null; // 'drag' | 'squeeze' | null
let activeTouchId = null;
const dragOffset = { x: 0, y: 0 };

window.addEventListener(
  'pointerdown',
  (e) => {
    if (!playing || e.target.closest('button')) return;
    if (isMouse(e)) {
      if (e.button !== 0) return;
      girl.x = e.clientX;
      girl.y = e.clientY;
      setHands(true);
      // segurando a bola: não deixa a órbita da câmera roubar o arraste
      controls.enabled = !tryGrab();
      return;
    }

    // Toque / caneta
    controls.enabled = false;
    if (activeTouchId !== null) return; // ignora multi-toque
    activeTouchId = e.pointerId;
    const c = girlBodyCenter();
    const onGirl =
      Math.hypot(e.clientX - c.x, e.clientY - c.y) < 90 ||
      Math.hypot(e.clientX - girl.x, e.clientY - girl.y) < 60;
    if (onGirl) {
      touchMode = 'drag';
      dragOffset.x = girl.x - e.clientX;
      dragOffset.y = girl.y - e.clientY;
    } else {
      touchMode = 'squeeze';
      setHands(true);
      tryGrab();
    }
  },
  { capture: true }
);

window.addEventListener('pointermove', (e) => {
  if (!playing) return;
  if (isMouse(e)) {
    girl.x = e.clientX;
    girl.y = e.clientY;
    cursorEl.style.opacity = '1';
    return;
  }
  if (e.pointerId === activeTouchId && touchMode === 'drag') {
    girl.x = THREE.MathUtils.clamp(e.clientX + dragOffset.x, 0, window.innerWidth);
    girl.y = THREE.MathUtils.clamp(e.clientY + dragOffset.y, 0, window.innerHeight);
  }
});

function onPointerEnd(e) {
  if (!playing) return;
  if (isMouse(e)) {
    setHands(false);
    release();
    controls.enabled = hasHover;
    return;
  }
  if (e.pointerId !== activeTouchId) return;
  activeTouchId = null;
  touchMode = null;
  setHands(false);
  release();
}
window.addEventListener('pointerup', onPointerEnd);
window.addEventListener('pointercancel', onPointerEnd);

// Esconde a menina quando o mouse sai da janela (no desktop).
document.addEventListener('mouseleave', () => (cursorEl.style.opacity = '0'));

// ---------------------------------------------------------------------------
// Redimensionar
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  girl.x = Math.min(girl.x, window.innerWidth);
  girl.y = Math.min(girl.y, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const frameDt = Math.min(clock.getDelta(), 1 / 20);
  // sub-passos para molas rígidas ficarem estáveis
  const steps = 4;
  for (let i = 0; i < steps; i++) stepPhysics(frameDt / steps);
  lastMinY = deformBall(); // malha recalculada uma vez por quadro
  updateBallColor(frameDt);
  followHands(frameDt);
  updateCursor(frameDt);
  controls.update();
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// Menus / estados do jogo
// ---------------------------------------------------------------------------
function startGame(character) {
  setCharacterImages(character);
  girl.closed = true; // força troca de imagem
  setHands(false);
  girl.x = window.innerWidth / 2;
  girl.y = window.innerHeight * 0.72;
  activeTouchId = null;
  touchMode = null;
  press.active = false;
  controls.autoRotate = false;
  controls.enabled = hasHover; // no toque, arrastar é da menina
  playing = true;
}

function stopGame() {
  playing = false;
  release();
  setHands(false);
  activeTouchId = null;
  touchMode = null;
  controls.enabled = false;
  controls.autoRotate = true;
}

initUI({ onStart: startGame, onMenu: stopGame });
