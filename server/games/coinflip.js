import { Router } from 'express';
import { randInt } from './rng.js';
import { parseBet, playOneShot } from './common.js';
import { bad } from '../util.js';

export const WIN_MULTIPLIER = 1.96;

export const coinflipRouter = Router();

coinflipRouter.post('/flip', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const choice = req.body?.choice;
  if (choice !== 'heads' && choice !== 'tails') throw bad('Bitte Kopf oder Zahl wählen');
  const result = playOneShot(req.user.id, 'coinflip', bet, () => {
    const outcome = randInt(0, 2) === 0 ? 'heads' : 'tails';
    const won = outcome === choice;
    return { outcome, choice, won, payout: won ? Math.floor(bet * WIN_MULTIPLIER) : 0, meta: { outcome, choice } };
  });
  res.json(result);
});
