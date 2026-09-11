import { h, fmt } from './ui.js';
import { sound } from './sound.js';

const parseChips = (str) => {
  const n = Number(String(str).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/**
 * Einsatz-Eingabe (in Chips, intern Cent).
 * balance(): aktueller Kontostand in Cent.
 */
export function betControl({ balance, value = 100_00, min = 1_00, onChange } = {}) {
  let cents = value;
  const input = h('input', { type: 'text', inputmode: 'decimal', value: fmt(cents), 'aria-label': 'Einsatz' });
  const set = (v) => {
    cents = Math.max(min, Math.min(Math.floor(v), 1_000_000_00));
    input.value = fmt(cents);
    onChange?.(cents);
  };
  input.addEventListener('change', () => { const v = parseChips(input.value); set(Number.isNaN(v) ? cents : v); });
  input.addEventListener('focus', () => input.select());

  const half = h('button.btn.btn-sm', { type: 'button', onclick: () => { sound.play('click'); set(cents / 2); } }, '½');
  const dbl = h('button.btn.btn-sm', { type: 'button', onclick: () => { sound.play('click'); set(Math.min(cents * 2, balance?.() ?? cents * 2)); } }, '2×');
  const max = h('button.btn.btn-sm', { type: 'button', onclick: () => { sound.play('click'); set(balance?.() ?? cents); } }, 'Max');
  const presets = [10_00, 50_00, 100_00, 500_00].map((p) =>
    h('button.btn.btn-sm', { type: 'button', onclick: () => { sound.play('click'); set(p); } }, fmt(p).replace(',00', ''))
  );
  const el = h('div.bet-control', {},
    h('div.bet-input', {}, h('span.coin', {}, '🪙'), input, half, dbl, max),
    h('div.bet-presets', {}, presets),
  );
  const buttons = [input, half, dbl, max, ...presets];
  return {
    el,
    get value() { return cents; },
    set value(v) { set(v); },
    set disabled(d) { buttons.forEach((b) => (b.disabled = d)); },
  };
}

export function segmented(options, value, onChange) {
  let current = value;
  const buttons = options.map((o) =>
    h('button', { type: 'button', class: o.value === current ? 'active' : '', onclick: () => api.set(o.value, true) }, o.label)
  );
  const el = h('div.segmented', {}, buttons);
  const api = {
    el,
    get value() { return current; },
    set(v, fire = false) {
      current = v;
      buttons.forEach((b, i) => b.classList.toggle('active', options[i].value === v));
      if (fire) { sound.play('click'); onChange?.(v); }
    },
    set disabled(d) { buttons.forEach((b) => (b.disabled = d)); },
  };
  return api;
}

export const CHIP_STYLES = [
  { value: 1_00, color: '#e9e9e9', text: '#222' },
  { value: 5_00, color: '#d63b2f', text: '#fff' },
  { value: 10_00, color: '#2f6fd6', text: '#fff' },
  { value: 25_00, color: '#22a35a', text: '#fff' },
  { value: 100_00, color: '#1c1c1c', text: '#fff' },
  { value: 500_00, color: '#7d3ab0', text: '#fff' },
  { value: 1000_00, color: '#d4af37', text: '#1a1305' },
];

export function chipSelector(onChange, initial = 10_00) {
  let current = initial;
  const buttons = CHIP_STYLES.map((c) =>
    h('button.chip-btn', {
      type: 'button',
      class: `chip-btn ${c.value === current ? 'active' : ''}`,
      style: { background: `radial-gradient(circle at 40% 35%, ${lighten(c.color)}, ${c.color} 70%)`, color: c.text },
      onclick: () => {
        current = c.value;
        buttons.forEach((b, i) => b.classList.toggle('active', CHIP_STYLES[i].value === current));
        sound.play('chip');
        onChange?.(current);
      },
    }, fmt(c.value).replace(',00', ''))
  );
  const el = h('div.chip-select', {}, buttons);
  return { el, get value() { return current; }, set disabled(d) { buttons.forEach((b) => (b.disabled = d)); } };
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + 70);
  const g = Math.min(255, ((n >> 8) & 255) + 70);
  const b = Math.min(255, (n & 255) + 70);
  return `rgb(${r},${g},${b})`;
}

export function statBox(label, initial = '–') {
  const value = h('div.value', {}, initial);
  const el = h('div.stat-box', {}, h('div.label', {}, label), value);
  return {
    el,
    set(text, cls = '') { value.textContent = text; value.className = `value ${cls}`; },
  };
}

export function historyStrip(max = 12) {
  const el = h('div.history-strip');
  return {
    el,
    push(text, cls = '') {
      el.prepend(h('span.pill', { class: `pill ${cls}` }, text));
      while (el.children.length > max) el.lastChild.remove();
    },
  };
}

export const section = (title, ...children) =>
  h('div.panel-section', {}, title ? h('div.title', {}, title) : null, ...children);

export const bigButton = (label, onClick, cls = 'btn-gold') =>
  h('button.btn.btn-big', { type: 'button', class: `btn btn-big ${cls}`, onclick: onClick }, label);
