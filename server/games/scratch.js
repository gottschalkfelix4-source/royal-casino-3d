import { Router } from 'express';
import { random, shuffle, pick } from './rng.js';
import { playOneShot } from './common.js';
import { bad } from '../util.js';

/**
 * Rubbellos: Der Spieler kauft ein Los einer Preisstufe; drei gleiche Symbole im 3×3-Raster gewinnen das
 * Vielfache des Lospreises. Die Auszahlung wird sofort beim Kauf gebucht, das Rubbeln ist nur Aufdeck-Animation.
 */

export const TIERS = [
  { key: 'silber', name: 'Silber', price: 100_00 },
  { key: 'gold', name: 'Gold', price: 500_00 },
  { key: 'platin', name: 'Platin', price: 2000_00 },
];

export const SYMBOLS = [
  { key: 'cherry', label: '🍒', multiplier: 1 },
  { key: 'bell', label: '🔔', multiplier: 2 },
  { key: 'clover', label: '🍀', multiplier: 5 },
  { key: 'gem', label: '💎', multiplier: 10 },
  { key: 'crown', label: '👑', multiplier: 25 },
  { key: 'seven', label: '7️⃣', multiplier: 100 },
  { key: 'bag', label: '💰', multiplier: 500 },
];

/**
 * Gewinnstufen mit Wahrscheinlichkeit je Los (der Rest ≈ 71,8 % sind Nieten).
 * RTP = Σ p·m = 0,155 + 0,14 + 0,175 + 0,15 + 0,15 + 0,09 + 0,05 = 0,92 (92 %).
 */
export const PRIZES = [
  { multiplier: 1, p: 0.155 },
  { multiplier: 2, p: 0.07 },
  { multiplier: 5, p: 0.035 },
  { multiplier: 10, p: 0.015 },
  { multiplier: 25, p: 0.006 },
  { multiplier: 100, p: 0.0009 },
  { multiplier: 500, p: 0.0001 },
];

export const RTP = PRIZES.reduce((s, r) => s + r.p * r.multiplier, 0);
export const WIN_CHANCE = PRIZES.reduce((s, r) => s + r.p, 0);
const SYMBOL_BY_MULT = new Map(SYMBOLS.map((s) => [s.multiplier, s]));
const KEYS = SYMBOLS.map((s) => s.key);

/** Gewinnstufe ziehen: 0 = Niete, sonst Multiplikator */
export function drawPrize() {
  let r = random(); // (0, 1]
  for (const prize of PRIZES) {
    r -= prize.p;
    if (r <= 0) return prize.multiplier;
  }
  return 0;
}

/** n Symbole aus pool ziehen, jedes höchstens `max`-mal */
function fillSymbols(n, pool, max = 2) {
  const counts = new Map();
  const out = [];
  for (let i = 0; i < n; i++) {
    const candidates = pool.filter((k) => (counts.get(k) ?? 0) < max);
    const k = pick(candidates);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    out.push(k);
  }
  return out;
}

/**
 * Erzeugt ein Los: { grid (9 Symbol-Keys), winSymbol, multiplier, payout }.
 * Gewinn: genau drei Felder mit dem Gewinnsymbol, die übrigen sechs andere Symbole (jedes höchstens zweimal).
 * Niete: jedes Symbol höchstens zweimal, also nie ein Drilling.
 */
export function generateCard(tierPrice) {
  const multiplier = drawPrize();
  let grid;
  let winSymbol = null;
  if (multiplier > 0) {
    winSymbol = SYMBOL_BY_MULT.get(multiplier).key;
    grid = [winSymbol, winSymbol, winSymbol, ...fillSymbols(6, KEYS.filter((k) => k !== winSymbol))];
  } else {
    grid = fillSymbols(9, KEYS);
  }
  shuffle(grid);
  return { grid, winSymbol, multiplier, payout: tierPrice * multiplier };
}

export const scratchRouter = Router();

scratchRouter.get('/config', (req, res) => {
  res.json({
    tiers: TIERS,
    symbols: SYMBOLS,
    prizeTable: PRIZES.map((p) => ({ ...SYMBOL_BY_MULT.get(p.multiplier), chance: p.p })),
    rtp: RTP,
  });
});

scratchRouter.post('/buy', (req, res) => {
  const tier = TIERS.find((t) => t.key === req.body?.tier);
  if (!tier) throw bad('Bitte eine gültige Losstufe wählen');
  const result = playOneShot(req.user.id, 'scratch', tier.price, () => {
    const card = generateCard(tier.price);
    return {
      grid: card.grid, winSymbol: card.winSymbol, multiplier: card.multiplier, tier: tier.key, payout: card.payout,
      meta: { result: card.multiplier > 0 ? 'win' : 'lose', multiplier: card.multiplier, tier: tier.key, symbol: card.winSymbol },
    };
  });
  res.json(result);
});
