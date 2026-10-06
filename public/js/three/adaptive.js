/** Hysteresis avoids resolution pumping. Long pauses/loading do not count as GPU pressure. */
export class AdaptiveResolution {
  constructor({ minScale = 0.7, effects = false } = {}) {
    this.scale = 1;
    this.minScale = minScale;
    this.effects = effects;
    this.effectLevel = 0;
    this.reset();
  }
  reset() { this.elapsed = 0; this.frames = 0; this.slow = 0; this.fast = 0; }
  sample(milliseconds) {
    // Even sub-1 FPS can be sustained overload. Hidden tabs are excluded by the engine.
    if (milliseconds < 1 || milliseconds > 2500) { this.reset(); return false; }
    this.elapsed += milliseconds; this.frames++;
    if (this.elapsed < 2000 || this.frames < 12) return false;
    const mean = this.elapsed / this.frames;
    this.mean = mean;
    // Leave headroom around a 60 Hz frame budget; avoid settling permanently at ~50 FPS.
    this.slow = mean > 18 ? this.slow + 1 : 0;
    // Auto must also recover on ordinary 60 Hz displays, where RAF cannot reach <14 ms.
    this.fast = mean < (this.effects ? 17.2 : 14) ? this.fast + 1 : 0;
    this.elapsed = 0; this.frames = 0;
    const old = this.scale;
    const oldLevel = this.effectLevel;
    if (this.slow >= (mean > 50 ? 1 : 2)) {
      this.scale = Math.max(this.minScale, +(this.scale - 0.1).toFixed(2));
      // Shed effects only in Auto; retain the running scene and mounted game.
      if (this.effects && mean > 28 && this.scale <= 0.8) this.effectLevel = Math.max(this.effectLevel, 1);
      if (this.effects && mean > 40 && this.scale <= 0.7) this.effectLevel = 2;
      this.slow = 0;
    }
    if (this.fast >= 4) { this.scale = Math.min(1, this.scale + 0.05); this.fast = 0; }
    return Math.abs(old - this.scale) > 0.001 || oldLevel !== this.effectLevel;
  }
}
