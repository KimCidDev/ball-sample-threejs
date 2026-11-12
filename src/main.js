import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Cena, câmera e renderizador
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Esfera
const geometry = new THREE.SphereGeometry(1, 64, 64);
const material = new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.35, metalness: 0.2 });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// Luzes
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 3, 5);
scene.add(light);

// Controles de órbita (arrastar para girar, scroll para zoom)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Ajuste ao redimensionar a janela
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Loop de animação
renderer.setAnimationLoop(() => {
  sphere.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
});
