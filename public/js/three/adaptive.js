/** Hysteresis avoids resolution pumping. Long pauses/loading do not count as GPU pressure. */
export class AdaptiveResolution {
  constructor() { this.scale = 1; this.reset(); }
  reset() { this.elapsed = 0; this.frames = 0; this.slow = 0; this.fast = 0; }
  sample(milliseconds) {
    if (milliseconds < 1 || milliseconds > 100) { this.reset(); return false; }
    this.elapsed += milliseconds; this.frames++;
    if (this.elapsed < 2000 || this.frames < 30) return false;
    const mean = this.elapsed / this.frames;
    // Leave headroom around a 60 Hz frame budget; avoid settling permanently at ~50 FPS.
    this.slow = mean > 18 ? this.slow + 1 : 0;
    this.fast = mean < 14 ? this.fast + 1 : 0;
    this.elapsed = 0; this.frames = 0;
    const old = this.scale;
    if (this.slow >= 2) { this.scale = Math.max(0.7, this.scale - 0.1); this.slow = 0; }
    if (this.fast >= 4) { this.scale = Math.min(1, this.scale + 0.05); this.fast = 0; }
    return Math.abs(old - this.scale) > 0.001;
  }
}
