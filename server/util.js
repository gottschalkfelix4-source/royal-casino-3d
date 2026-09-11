export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export const bad = (msg) => new HttpError(400, msg);

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Ganzzahliger Cent-Betrag aus Client-Eingabe (Cent). */
export function toCents(value, { min = 1, max = 100_000_000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw bad('Ungültiger Betrag');
  const cents = Math.round(n);
  if (cents < min) throw bad('Betrag zu niedrig');
  if (cents > max) throw bad('Betrag zu hoch');
  return cents;
}
