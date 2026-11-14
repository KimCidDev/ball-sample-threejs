// Menus: tela inicial -> escolha de personagem -> jogo.

// BASE_URL permite publicar em subpasta (ex.: GitHub Pages).
const BASE = import.meta.env.BASE_URL;

export const CHARACTERS = {
  mama: {
    name: 'Mamá',
    open: `${BASE}cursor/girl-open.png`,
    closed: `${BASE}cursor/girl-closed.png`,
    portrait: `${BASE}characters/mama.png`,
  },
};

export function initUI({ onStart, onMenu }) {
  const screens = {
    title: document.getElementById('screen-title'),
    select: document.getElementById('screen-select'),
  };
  const hint = document.getElementById('hint');
  const hudName = document.getElementById('hud-name');
  const touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  let selected = 'mama';

  document.querySelectorAll('.char-card').forEach((card) => {
    const img = card.querySelector('img');
    if (img) img.src = CHARACTERS[card.dataset.character].portrait;
  });

  function show(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
    const target = screens[name]?.querySelector('.btn:not(.ghost), .btn');
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 50);
  }

  function start() {
    show(null);
    const character = CHARACTERS[selected];
    hudName.textContent = character.name;
    hint.textContent = touch
      ? `Arraste a ${character.name} até a bola e toque e segure a tela para apertar!`
      : 'Clique e segure na bola para apertar!';
    // reinicia a animação da dica
    hint.style.animation = 'none';
    void hint.offsetWidth;
    hint.style.animation = '';
    document.body.classList.add('playing');
    onStart(character);
  }

  function backToMenu() {
    document.body.classList.remove('playing');
    onMenu();
    show('title');
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.char-card');
    if (card) {
      selected = card.dataset.character;
      document.querySelectorAll('.char-card').forEach((c) => {
        const on = c === card;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-pressed', String(on));
      });
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'play' || action === 'start') start();
    else if (action === 'choose') show('select');
    else if (action === 'back') show('title');
    else if (action === 'menu') backToMenu();
  });

  // Duplo clique no card também começa o jogo.
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.char-card')) start();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('playing')) backToMenu();
  });

  show('title');
}
