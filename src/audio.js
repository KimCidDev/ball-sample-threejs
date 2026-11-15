// Sons sintetizados na hora (Web Audio) — nenhum arquivo de áudio.
const KEY = 'squishy-som';

let ctx = null;
let master = null;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === 'off';
} catch {
  /* armazenamento indisponível: começa com som */
}

// O navegador só libera áudio depois de um gesto do usuário.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? 'off' : 'on');
  } catch {
    /* ignora */
  }
  if (master) master.gain.setTargetAtTime(value ? 0 : 0.6, ctx.currentTime, 0.02);
}

function ready() {
  return ctx && !muted && ctx.state === 'running';
}

let noiseBuffer = null;
function noise() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

function env(gainNode, t, peak, attack, decay) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// Apertar: "squish" molhado (ruído filtrado descendo + grave).
export function playSquish() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(260, t + 0.25);
  const g = ctx.createGain();
  env(g, t, 0.5, 0.02, 0.26);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.32);

  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.22);
  const og = ctx.createGain();
  env(og, t, 0.35, 0.01, 0.22);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.26);
}

// Soltar: "boing" (mais forte quanto mais apertada estava).
export function playBoing(energy = 1) {
  if (!ready() || energy < 0.08) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  const base = 200 + energy * 120;
  o.frequency.setValueAtTime(base, t);
  o.frequency.exponentialRampToValueAtTime(base * 2.4, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.4);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 14;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = base * 0.12;
  lfo.connect(lfoGain).connect(o.frequency);
  const g = ctx.createGain();
  env(g, t, 0.25 + 0.25 * energy, 0.015, 0.42);
  o.connect(g).connect(master);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.5);
  lfo.stop(t + 0.5);
}

// Batida no chão/parede.
let lastThud = 0;
export function playThud(speed) {
  if (!ready()) return;
  const t = ctx.currentTime;
  if (t - lastThud < 0.06) return;
  lastThud = t;
  const vol = Math.min(0.5, speed * 0.09);
  if (vol < 0.04) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
  const g = ctx.createGain();
  env(g, t, vol, 0.005, 0.14);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.18);
}
