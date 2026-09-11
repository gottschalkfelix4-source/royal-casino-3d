import { Router } from 'express';
import { randInt } from './rng.js';
import { parseBet, playOneShot } from './common.js';

// 24 Segmente – EV ≈ 0.94
export const SEGMENTS = [
  0, 1.5, 0, 2, 0, 1.5, 0, 0, 3, 0, 1.5, 0,
  5, 0, 0, 2, 0, 1.5, 0, 3, 0, 0, 1.5, 0,
];

export const wheelRouter = Router();

wheelRouter.get('/config', (req, res) => res.json({ segments: SEGMENTS }));

wheelRouter.post('/spin', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const result = playOneShot(req.user.id, 'wheel', bet, () => {
    const index = randInt(0, SEGMENTS.length);
    const multiplier = SEGMENTS[index];
    return { index, multiplier, payout: Math.floor(bet * multiplier), meta: { multiplier } };
  });
  res.json(result);
});
