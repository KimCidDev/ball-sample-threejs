// Menus: tela inicial -> personagens / cenários -> jogo.
import { CHARACTERS, SCENARIOS } from './characters.js';
import { isMuted, setMuted, unlockAudio } from './audio.js';

const STORE = 'squishy-escolhas';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}
function save(data) {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
  } catch {
    /* ignora */
  }
}

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export function initUI({ onStart, onMenu, onScenario }) {
  const screens = {
    title: document.getElementById('screen-title'),
    select: document.getElementById('screen-select'),
    scenes: document.getElementById('screen-scenes'),
  };
  const hint = document.getElementById('hint');
  const hudName = document.getElementById('hud-name');
  const hudScene = document.getElementById('hud-scene');
  const hudSound = document.getElementById('hud-sound');
  const touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const saved = load();
  let character = CHARACTERS[saved.character] ? saved.character : 'mama';
  let scenario = SCENARIOS[saved.scenario] ? saved.scenario : 'brasil';
  let playing = false;

  // Cards de personagem gerados a partir da lista.
  const cardsEl = document.getElementById('character-cards');
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const card = document.createElement('button');
    card.className = 'card';
    card.dataset.character = id;
    card.style.setProperty('--tint', c.color);
    card.style.setProperty('--tint-light', lighten(c.color, 0.6));
    card.innerHTML =
      `<img src="${c.portrait}" alt="${c.name} com os braços erguidos" draggable="false" />` +
      (c.placeholder ? '<span class="badge">foto em breve</span>' : '') +
      `<span class="card-name">${c.name}</span>`;
    cardsEl.appendChild(card);
  }

  function markSelected() {
    document.querySelectorAll('[data-character]').forEach((el) => {
      const on = el.dataset.character === character;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-scene]').forEach((el) => {
      const on = el.dataset.scene === scenario;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', String(on));
    });
    const other = scenario === 'brasil' ? 'canada' : 'brasil';
    hudScene.innerHTML = `<span class="long">Ir para o </span>${SCENARIOS[other].name}`;
    save({ character, scenario });
  }

  function updateSound() {
    hudSound.textContent = isMuted() ? '🔇' : '🔊';
    hudSound.setAttribute('aria-label', isMuted() ? 'Ligar som' : 'Desligar som');
  }

  function show(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
    const target = screens[name]?.querySelector('.btn:not(.ghost)');
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 50);
  }

  function setScenario(id) {
    scenario = id;
    markSelected();
    onScenario(id);
  }

  function start() {
    show(null);
    const c = CHARACTERS[character];
    hudName.textContent = c.name;
    hint.textContent = touch
      ? 'Toque e segure na bola para apertar · arraste para levar a bola'
      : 'Clique e segure na bola para apertar · arraste para jogar a bola';
    document.body.classList.add('playing');
    playing = true;
    onStart(c);
  }

  function backToMenu() {
    document.body.classList.remove('playing');
    playing = false;
    onMenu();
    show('title');
  }

  document.addEventListener('pointerdown', unlockAudio, { capture: true });

  document.addEventListener('click', (e) => {
    const charCard = e.target.closest('[data-character]');
    if (charCard) {
      character = charCard.dataset.character;
      markSelected();
      return;
    }
    const sceneCard = e.target.closest('[data-scene]');
    if (sceneCard) {
      setScenario(sceneCard.dataset.scene);
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'play' || action === 'start') start();
    else if (action === 'choose') show('select');
    else if (action === 'scenes') show('scenes');
    else if (action === 'back') show('title');
    else if (action === 'menu') backToMenu();
    else if (action === 'swap-scene') setScenario(scenario === 'brasil' ? 'canada' : 'brasil');
    else if (action === 'sound') {
      unlockAudio();
      setMuted(!isMuted());
      updateSound();
    }
  });

  // Duplo clique num card também começa o jogo.
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.card')) start();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playing) backToMenu();
  });

  markSelected();
  updateSound();
  onScenario(scenario);
  show('title');
}
