import { randomInt, randomBytes } from 'node:crypto';

/** Ganzzahl in [min, max) – kryptografisch sicher. */
export const randInt = (min, max) => randomInt(min, max);

/** Gleichverteilte Zahl in (0, 1]. */
export function random() {
  const n = randomBytes(6).readUIntBE(0, 6); // 48 Bit
  return (n + 1) / 2 ** 48;
}

/** Fisher-Yates-Mischung (in place). */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const pick = (arr) => arr[randomInt(0, arr.length)];
