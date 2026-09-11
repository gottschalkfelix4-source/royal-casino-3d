import { Router } from 'express';
import { randInt } from './rng.js';
import { parseBet, playOneShot } from './common.js';
import { bad } from '../util.js';

export const MULTIPLIERS = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

export const plinkoRouter = Router();

plinkoRouter.get('/config', (req, res) => res.json({ multipliers: MULTIPLIERS }));

plinkoRouter.post('/drop', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const rows = Number(req.body?.rows);
  const risk = String(req.body?.risk ?? 'medium');
  if (!MULTIPLIERS[rows]) throw bad('Ungültige Reihenzahl');
  if (!MULTIPLIERS[rows][risk]) throw bad('Ungültiges Risiko');

  const result = playOneShot(req.user.id, 'plinko', bet, () => {
    const path = Array.from({ length: rows }, () => randInt(0, 2)); // 0 = links, 1 = rechts
    const bucket = path.reduce((a, b) => a + b, 0);
    const multiplier = MULTIPLIERS[rows][risk][bucket];
    return { rows, risk, path, bucket, multiplier, payout: Math.floor(bet * multiplier), meta: { multiplier } };
  });
  res.json(result);
});
