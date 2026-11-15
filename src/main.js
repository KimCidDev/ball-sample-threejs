import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBall, RADIUS } from './ball.js';
import { createScenery } from './scenes.js';
import { CHARACTERS } from './characters.js';
import { initUI } from './ui.js';
import { playBoing, playSquish, playThud } from './audio.js';

// ---------------------------------------------------------------------------
// Cena, câmera e renderizador
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2.4, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 30 });
sun.shadow.radius = 5;
sun.shadow.bias = -0.0005;
scene.add(sun);

// luz suave vinda da câmera: a bola nunca fica com a frente escura
const fill = new THREE.DirectionalLight(0xffffff, 1.1);
camera.add(fill);
fill.position.set(0.3, 0.4, 1);
scene.add(camera);

const scenery = createScenery(scene, { hemi, sun });

// ---------------------------------------------------------------------------
// Bola
// ---------------------------------------------------------------------------
const ball = createBall();
scene.add(ball.mesh);
ball.onImpact = (speed) => playThud(speed);

// ---------------------------------------------------------------------------
// Câmera: segue a bola; no menu gira sozinha e fica mais longe
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI / 2 - 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.enabled = false;

// Em tela de celular (em pé) a câmera fica mais longe para a bola caber.
const fitDist = (d) => d * Math.max(1, 1 / (camera.aspect * 1.6));
const MENU_DIST = 7.2;
const GAME_DIST = 5.2;
let distAnim = fitDist(MENU_DIST); // distância desejada enquanto a câmera se ajusta sozinha
const _camOffset = new THREE.Vector3();
const _follow = new THREE.Vector3();

function updateCamera(dt) {
  // alvo acompanha a bola (só no plano do chão, para não pular junto)
  _follow.set(ball.pos.x, 0.9, ball.pos.z);
  _camOffset.copy(_follow).sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
  controls.target.add(_camOffset);
  camera.position.add(_camOffset);

  if (distAnim !== null) {
    const offset = camera.position.clone().sub(controls.target);
    const d = offset.length();
    const next = d + (distAnim - d) * Math.min(1, dt * 3);
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    if (Math.abs(next - distAnim) < 0.01) distAnim = null;
  }
  controls.update();
}

let playing = false;

// ---------------------------------------------------------------------------
// Personagem (cursor): segue o ponteiro, volta ao lugar e fica sempre em pé
// ---------------------------------------------------------------------------
const CURSOR_W = 150; // largura exibida (imagens em 2x: 300x360)
const CURSOR_H = 180;
const HOTSPOT_X = 75; // ponto entre as mãos
const HOTSPOT_Y = 30;
const MAX_TILT = 0.85; // inclinação máxima (rad) — nunca de cabeça para baixo

const imgOpen = new Image();
const imgClosed = new Image();
function setCharacterImages(character) {
  imgOpen.src = character.open;
  imgClosed.src = character.closed;
}
setCharacterImages(CHARACTERS.mama);

const cursorEl = document.createElement('img');
cursorEl.id = 'girl-cursor';
cursorEl.alt = '';
cursorEl.draggable = false;
Object.assign(cursorEl.style, {
  width: `${CURSOR_W}px`,
  transformOrigin: `${HOTSPOT_X}px ${HOTSPOT_Y}px`,
});
document.body.appendChild(cursorEl);

const girl = {
  x: window.innerWidth / 2,
  y: window.innerHeight * 0.75,
  angle: 0,
  closed: null,
  following: false, // true = acompanha o ponteiro; false = volta para o lugar dela
  squash: 0,
};

function setHands(closed) {
  if (girl.closed === closed) return;
  girl.closed = closed;
  cursorEl.src = closed ? imgClosed.src : imgOpen.src;
}

const _proj = new THREE.Vector3();
function toScreen(v) {
  _proj.copy(v).project(camera);
  return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight };
}
function ballScreen() {
  const c = toScreen(ball.pos);
  // raio aproximado da bola na tela
  const dist = camera.position.distanceTo(ball.pos);
  const r = (RADIUS / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (window.innerHeight / 2);
  return { ...c, r };
}

// Lugar de descanso: segurando a bola por baixo, em pé.
function homePosition(b) {
  return {
    x: THREE.MathUtils.clamp(b.x, CURSOR_W / 2, window.innerWidth - CURSOR_W / 2),
    y: THREE.MathUtils.clamp(b.y + b.r * 0.95, 80, window.innerHeight - CURSOR_H + HOTSPOT_Y + 10),
  };
}

function updateCursor(dt) {
  const b = ballScreen();
  if (!girl.following && !ball.press.active) {
    const h = homePosition(b);
    const k = Math.min(1, dt * 6);
    girl.x += (h.x - girl.x) * k;
    girl.y += (h.y - girl.y) * k;
  }

  // Inclina na direção da bola só quando está perto dela (ou apertando),
  // com limite — longe da bola ela fica em pé.
  const dx = b.x - girl.x;
  const dy = b.y - girl.y;
  const dist = Math.hypot(dx, dy);
  let target = 0;
  if (dist > 8) {
    const aim = Math.atan2(dx, -dy);
    const near = ball.press.active ? 1 : THREE.MathUtils.clamp(1 - (dist - b.r * 1.2) / (b.r * 2.5 + 80), 0, 1);
    target = THREE.MathUtils.clamp(aim, -MAX_TILT, MAX_TILT) * near;
  }
  girl.angle += (target - girl.angle) * Math.min(1, dt * 10);

  // pequeno "esforço" visual enquanto aperta
  const sq = ball.press.active ? 0.05 + ball.squeezeAmount() * 0.05 : 0;
  girl.squash += (sq - girl.squash) * Math.min(1, dt * 12);

  cursorEl.style.transform =
    `translate(${girl.x - HOTSPOT_X}px, ${girl.y - HOTSPOT_Y}px) rotate(${girl.angle}rad) ` +
    `scale(${1 + girl.squash * 0.5}, ${1 - girl.squash})`;
}

// ---------------------------------------------------------------------------
// Interação: apertar, arrastar e arremessar
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const grabPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const grabOffset = new THREE.Vector3();
const holdTarget = new THREE.Vector3();
const _planeHit = new THREE.Vector3();

function rayFromHands() {
  ndc.set((girl.x / window.innerWidth) * 2 - 1, -(girl.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

// Direção (mundo) de onde a personagem aperta: mistura o ponto tocado com o
// lado da tela em que ela está, para o afundamento aparecer de frente.
const _screenDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _tmp = new THREE.Vector3();
function computePressDir(hitPoint, out) {
  const b = toScreen(ball.pos);
  let sx = girl.x - b.x;
  let sy = -(girl.y - b.y);
  if (Math.hypot(sx, sy) < 12) {
    sx = Math.sin(girl.angle);
    sy = -Math.cos(girl.angle);
  }
  camera.matrixWorld.extractBasis(_camRight, _camUp, _tmp);
  _screenDir.copy(_camRight).multiplyScalar(sx).addScaledVector(_camUp, sy).normalize();
  out.copy(hitPoint).sub(ball.pos).normalize();
  return out.multiplyScalar(0.6).addScaledVector(_screenDir, 1).normalize();
}

function tryGrab() {
  rayFromHands();
  const hit = raycaster.intersectObject(ball.mesh, false)[0];
  if (!hit) return false;
  ball.grab(computePressDir(hit.point, new THREE.Vector3()));
  // plano horizontal na altura do centro da bola: as mãos arrastam nele
  grabPlane.constant = -ball.pos.y;
  if (raycaster.ray.intersectPlane(grabPlane, _planeHit)) {
    grabOffset.set(ball.pos.x - _planeHit.x, 0, ball.pos.z - _planeHit.z);
  } else {
    grabOffset.set(0, 0, 0);
  }
  holdTarget.copy(ball.pos);
  ball.press.holdTarget = holdTarget;
  playSquish();
  return true;
}

const _newDir = new THREE.Vector3();
function followHands(dt) {
  if (!ball.press.active) return;
  rayFromHands();
  if (raycaster.ray.intersectPlane(grabPlane, _planeHit)) {
    holdTarget.set(_planeHit.x + grabOffset.x, 0, _planeHit.z + grabOffset.z);
  }
  const hit = raycaster.intersectObject(ball.mesh, false)[0];
  if (hit) {
    computePressDir(hit.point, _newDir);
    ball.press.dir.lerp(_newDir, Math.min(1, dt * 8)).normalize();
  }
}

function release() {
  const energy = ball.release();
  if (energy) playBoing(energy);
}

// Mouse: a personagem segue o ponteiro; clicar e segurar na bola aperta,
// arrastar leva a bola junto. Fora da bola, arrastar gira a câmera.
// Toque: mesma coisa com o dedo; ao soltar ela volta para o lugar.
const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isMouse = (e) => e.pointerType === 'mouse' && hasHover;
let activePointer = null;

window.addEventListener(
  'pointerdown',
  (e) => {
    if (!playing || e.target.closest('button')) return;
    if (activePointer !== null) return; // ignora multitoque
    if (isMouse(e) && e.button !== 0) return;
    activePointer = e.pointerId;
    girl.following = true;
    girl.x = e.clientX;
    girl.y = e.clientY;
    setHands(true);
    const grabbed = tryGrab();
    // segurando a bola: a órbita da câmera não pode roubar o arraste
    controls.enabled = isMouse(e) && !grabbed;
  },
  { capture: true }
);

window.addEventListener('pointermove', (e) => {
  if (!playing) return;
  if (isMouse(e)) {
    girl.following = true;
    girl.x = e.clientX;
    girl.y = e.clientY;
  } else if (e.pointerId === activePointer) {
    girl.x = e.clientX;
    girl.y = e.clientY;
  }
});

function onPointerEnd(e) {
  if (!playing || e.pointerId !== activePointer) return;
  activePointer = null;
  setHands(false);
  release();
  controls.enabled = hasHover;
  if (!isMouse(e)) girl.following = false; // no toque, volta para o lugar
}
window.addEventListener('pointerup', onPointerEnd);
window.addEventListener('pointercancel', onPointerEnd);

// Mouse saiu da janela: solta a bola e a personagem volta para o lugar.
document.addEventListener('mouseleave', () => {
  if (!playing) return;
  if (activePointer !== null) {
    activePointer = null;
    setHands(false);
    release();
  }
  girl.following = false;
});

// ---------------------------------------------------------------------------
// Redimensionar
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;
  if (playing) followHands(dt);
  ball.update(dt);
  scenery.update(dt, t);
  updateCamera(dt);
  if (playing) updateCursor(dt);
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// Estados do jogo
// ---------------------------------------------------------------------------
function startGame(character) {
  setCharacterImages(character);
  girl.closed = null;
  setHands(false);
  girl.following = false;
  const b = ballScreen();
  const h = homePosition(b);
  girl.x = h.x;
  girl.y = h.y;
  girl.angle = 0;
  activePointer = null;
  ball.release();
  controls.autoRotate = false;
  controls.enabled = hasHover;
  distAnim = fitDist(GAME_DIST);
  playing = true;
}

function stopGame() {
  playing = false;
  release();
  setHands(false);
  activePointer = null;
  controls.enabled = false;
  controls.autoRotate = true;
  distAnim = fitDist(MENU_DIST);
}

function setScenario(id) {
  const s = scenery.set(id);
  ball.setColors(s.ball);
}

initUI({ onStart: startGame, onMenu: stopGame, onScenario: setScenario });

// Ganchos para testes automatizados (só no modo de desenvolvimento).
if (import.meta.env.DEV) window.__squishy = { ball, girl, camera, controls };
