const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('de-DE');

/** Cent -> "1.234,56" */
export const fmt = (cents) => nf.format((cents ?? 0) / 100);
export const fmtSigned = (cents) => (cents >= 0 ? '+' : '−') + fmt(Math.abs(cents));
export const fmtInt = (n) => nf0.format(n);
export const fmtMult = (m) => `${(Math.round(m * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

/** Kleiner DOM-Helfer: h('div.cls#id', { onclick }, 'Text', child, [children]) */
export function h(spec, attrs, ...children) {
  const [tag, ...parts] = spec.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const p of parts) {
    if (p.startsWith('.')) el.classList.add(p.slice(1));
    else if (p.startsWith('#')) el.id = p.slice(1);
  }
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'class') el.className = v;
      else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? '' : v);
    }
  } else if (attrs != null) {
    children.unshift(attrs);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function toast(message, type = 'info', ms = 3200) {
  const root = document.getElementById('toasts');
  const el = h('div.toast', { class: `toast ${type}` }, message);
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

export function openModal({ title, body, onClose }) {
  const root = document.getElementById('modal-root');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const modal = h('div.modal', {}, h('button.close', { onclick: close, 'aria-label': 'Schließen' }, '×'), title ? h('h2', {}, title) : null, body);
  const backdrop = h('div.modal-backdrop', { onclick: (e) => { if (e.target === backdrop) close(); } }, modal);
  root.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  return { close, el: modal };
}

/** Zahl animiert hochzählen. */
export function countTo(el, from, to, ms = 700, format = fmt) {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CARD_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const cardText = (c) => `${CARD_LABEL[c.r] ?? c.r}${SUIT_CHAR[c.s]}`;
