// Kleine synthetische Soundeffekte per WebAudio (keine Dateien nötig)
let ctx = null;
let master = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

function tone({ freq = 440, type = 'sine', duration = 0.15, gain = 0.5, delay = 0, slideTo = null, attack = 0.005 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise({ duration = 0.2, gain = 0.4, delay = 0, filter = 1200 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const FX = {
  click: () => tone({ freq: 900, type: 'square', duration: 0.05, gain: 0.15 }),
  chip: () => { tone({ freq: 1800, type: 'triangle', duration: 0.06, gain: 0.25 }); tone({ freq: 2400, type: 'triangle', duration: 0.05, gain: 0.15, delay: 0.03 }); },
  deal: () => noise({ duration: 0.09, gain: 0.25, filter: 3000 }),
  flip: () => noise({ duration: 0.12, gain: 0.2, filter: 2000 }),
  tick: () => tone({ freq: 1400, type: 'square', duration: 0.025, gain: 0.08 }),
  spin: () => tone({ freq: 220, type: 'sawtooth', duration: 0.4, gain: 0.15, slideTo: 440 }),
  stop: () => { tone({ freq: 300, type: 'square', duration: 0.08, gain: 0.2 }); noise({ duration: 0.08, gain: 0.15, filter: 800 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', duration: 0.25, gain: 0.35, delay: i * 0.09 })),
  bigwin: () => [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => { tone({ freq: f, type: 'triangle', duration: 0.35, gain: 0.35, delay: i * 0.1 }); tone({ freq: f / 2, type: 'sine', duration: 0.35, gain: 0.2, delay: i * 0.1 }); }),
  lose: () => { tone({ freq: 220, type: 'sawtooth', duration: 0.3, gain: 0.2, slideTo: 110 }); },
  cashout: () => [880, 1109, 1319].forEach((f, i) => tone({ freq: f, type: 'sine', duration: 0.2, gain: 0.35, delay: i * 0.07 })),
  boom: () => { noise({ duration: 0.6, gain: 0.7, filter: 500 }); tone({ freq: 90, type: 'sine', duration: 0.5, gain: 0.6, slideTo: 30 }); },
  rocket: () => noise({ duration: 0.5, gain: 0.15, filter: 700 }),
  bounce: () => tone({ freq: 700, type: 'sine', duration: 0.05, gain: 0.12, slideTo: 500 }),
  dice: () => { for (let i = 0; i < 4; i++) noise({ duration: 0.06, gain: 0.25, delay: i * 0.08, filter: 2500 }); },
  coin: () => { tone({ freq: 2600, type: 'triangle', duration: 0.5, gain: 0.25 }); tone({ freq: 3900, type: 'sine', duration: 0.6, gain: 0.12 }); },
  gem: () => [1568, 2093].forEach((f, i) => tone({ freq: f, type: 'sine', duration: 0.18, gain: 0.3, delay: i * 0.06 })),
};

export const sound = {
  enabled: localStorage.getItem('casino.sound') !== 'off',
  play(name) {
    if (!this.enabled || !FX[name]) return;
    try {
      ensure();
      if (ctx?.state === 'suspended') ctx.resume();
      FX[name]();
    } catch { /* Audio nicht verfügbar */ }
  },
  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem('casino.sound', on ? 'on' : 'off');
  },
};
