import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { slotsRouter } from './slots.js';
import { rouletteRouter } from './roulette.js';
import { blackjackRouter } from './blackjack.js';
import { videopokerRouter } from './videopoker.js';
import { baccaratRouter } from './baccarat.js';
import { diceRouter } from './dice.js';
import { plinkoRouter } from './plinko.js';
import { crashRouter } from './crash.js';
import { minesRouter } from './mines.js';
import { coinflipRouter } from './coinflip.js';
import { wheelRouter } from './wheel.js';
import { hiloRouter } from './hilo.js';

export const gamesRouter = Router();
gamesRouter.use(requireAuth);

gamesRouter.get('/active', (req, res) => {
  const rows = db.prepare("SELECT type FROM games WHERE user_id = ? AND status = 'active'").all(req.user.id);
  res.json({ active: rows.map((r) => r.type) });
});

gamesRouter.use('/slots', slotsRouter);
gamesRouter.use('/roulette', rouletteRouter);
gamesRouter.use('/blackjack', blackjackRouter);
gamesRouter.use('/videopoker', videopokerRouter);
gamesRouter.use('/baccarat', baccaratRouter);
gamesRouter.use('/dice', diceRouter);
gamesRouter.use('/plinko', plinkoRouter);
gamesRouter.use('/crash', crashRouter);
gamesRouter.use('/mines', minesRouter);
gamesRouter.use('/coinflip', coinflipRouter);
gamesRouter.use('/wheel', wheelRouter);
gamesRouter.use('/hilo', hiloRouter);
