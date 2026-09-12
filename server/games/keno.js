import { Router } from 'express';
import { shuffle } from './rng.js';
import { parseBet, playOneShot } from './common.js';
import { bad } from '../util.js';

/**
 * Keno: Spieler tippt 1–10 Zahlen aus 1..80, gezogen werden 20. Auszahlung = Einsatz × Multiplikator
 * aus der Tabelle je (Anzahl getippt, Treffer). RTP je Tippanzahl liegt zwischen 91,8 % und 94,5 %.
 */
export const POOL = 80;
export const DRAWS = 20;
export const MIN_SPOTS = 1;
export const MAX_SPOTS = 10;

/** Multiplikatoren: paytable[getippt][treffer] – nicht aufgeführte Treffer zahlen 0 */
export const paytable = {
  1: { 1: 3.75 },
  2: { 2: 15.5 },
  3: { 2: 2, 3: 47 },
  4: { 2: 1, 3: 7, 4: 140 },
  5: { 3: 3, 4: 25, 5: 600 },
  6: { 3: 2, 4: 8, 5: 80, 6: 1600 },
  7: { 3: 1, 4: 5, 5: 28, 6: 180, 7: 5000 },
  8: { 4: 3, 5: 18, 6: 80, 7: 850, 8: 8000 },
  9: { 4: 2, 5: 6, 6: 45, 7: 250, 8: 2500, 9: 10000 },
  10: { 5: 5, 6: 26, 7: 140, 8: 1000, 9: 4500, 10: 10000 },
};

/** Binomialkoeffizient (als Gleitkommazahl, für n ≤ 80 ausreichend genau) */
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Exakte hypergeometrische Wahrscheinlichkeit für k Treffer bei n getippten Zahlen (20 aus 80 gezogen) */
export function hitProbability(n, k) {
  return (choose(DRAWS, k) * choose(POOL - DRAWS, n - k)) / choose(POOL, n);
}

/** Erwartete Auszahlung je Einsatz für n getippte Zahlen (z. B. 0.9375 = 93,75 %) */
export function rtpFor(n) {
  let rtp = 0;
  for (const [k, m] of Object.entries(paytable[n] ?? {})) rtp += hitProbability(n, Number(k)) * m;
  return rtp;
}

/** Ziehung: 20 verschiedene Zahlen aus 1..80 in Ziehungsreihenfolge */
export function drawNumbers() {
  const all = Array.from({ length: POOL }, (_, i) => i + 1);
  return shuffle(all).slice(0, DRAWS);
}

export const multiplierFor = (spots, hits) => paytable[spots]?.[hits] ?? 0;

/** Tipps des Spielers prüfen: 1–10 ganze Zahlen aus 1..80 ohne Duplikate */
export function parseNumbers(value) {
  if (!Array.isArray(value)) throw bad('Bitte Zahlen wählen');
  if (value.length < MIN_SPOTS) throw bad('Bitte mindestens eine Zahl wählen');
  if (value.length > MAX_SPOTS) throw bad(`Höchstens ${MAX_SPOTS} Zahlen erlaubt`);
  const numbers = value.map((v) => Number(v));
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > POOL)) throw bad('Zahlen müssen zwischen 1 und 80 liegen');
  if (new Set(numbers).size !== numbers.length) throw bad('Jede Zahl darf nur einmal getippt werden');
  return numbers;
}

export const kenoRouter = Router();

kenoRouter.get('/config', (req, res) => {
  res.json({ minSpots: MIN_SPOTS, maxSpots: MAX_SPOTS, draws: DRAWS, pool: POOL, paytable });
});

kenoRouter.post('/play', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const numbers = parseNumbers(req.body?.numbers);
  const result = playOneShot(req.user.id, 'keno', bet, () => {
    const drawn = drawNumbers();
    const drawnSet = new Set(drawn);
    const hitNumbers = numbers.filter((n) => drawnSet.has(n));
    const hits = hitNumbers.length;
    const multiplier = multiplierFor(numbers.length, hits);
    const payout = Math.floor(bet * multiplier);
    return {
      drawn, numbers, hits, hitNumbers, multiplier, payout,
      meta: { result: payout > 0 ? 'win' : 'lose', multiplier: payout / bet, spots: numbers.length, hits },
    };
  });
  res.json(result);
});
