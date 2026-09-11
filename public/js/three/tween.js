export const Easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625; const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/** Verwaltet zeitbasierte Tweens; update(now) einmal pro Frame aufrufen. */
export class Tweener {
  constructor() {
    this.items = new Set();
    this.timeScale = 1; // > 1 beschleunigt alle Animationen (z. B. zum Testen)
  }

  add(duration, fn, ease = Easing.outCubic) {
    return new Promise((resolve) => {
      this.items.add({ start: null, duration, fn, ease, resolve });
    });
  }

  update(now) {
    for (const t of this.items) {
      if (t.start === null) t.start = now;
      const p = t.duration <= 0 ? 1 : ((now - t.start) * this.timeScale) / t.duration;
      if (p >= 1) {
        this.items.delete(t);
        t.fn(1);
        t.resolve();
      } else {
        t.fn(t.ease(p));
      }
    }
  }

  clear() { this.items.clear(); }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
