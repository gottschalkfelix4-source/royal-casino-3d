import { Router } from 'express';
import { shuffle } from './rng.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, saveGame, finishGame, transaction } from './common.js';
import { bad } from '../util.js';

const TYPE = 'mines';
const CELLS = 25;

/** Multiplikator nach k sicheren Feldern (RTP 99 %) */
export function multiplier(k, mines) {
  let m = 0.99;
  for (let i = 0; i < k; i++) m *= (CELLS - i) / (CELLS - mines - i);
  return Math.round(m * 10000) / 10000;
}

function publicState(game, balance) {
  const s = game.state;
  const k = s.revealed.length;
  const finished = s.status !== 'active';
  return {
    id: game.id, bet: game.bet, status: s.status, mines: s.mineCount,
    revealed: s.revealed, safeLeft: CELLS - s.mineCount - k,
    multiplier: multiplier(k, s.mineCount), nextMultiplier: multiplier(k + 1, s.mineCount),
    minePositions: finished ? s.mines : null, hit: s.hit ?? null, payout: s.payout ?? null, balance,
  };
}

export const minesRouter = Router();

minesRouter.get('/current', (req, res) => {
  const g = getActiveGame(req.user.id, TYPE);
  res.json({ game: g ? publicState(g) : null });
});

minesRouter.post('/start', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const mineCount = Number(req.body?.mines);
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) throw bad('1 bis 24 Minen');
  const mines = shuffle(Array.from({ length: CELLS }, (_, i) => i)).slice(0, mineCount).sort((a, b) => a - b);
  const game = startGame(req.user.id, TYPE, bet, { mines, mineCount, revealed: [], status: 'active' });
  res.json({ game: publicState(game, game.balance) });
});

minesRouter.post('/reveal', (req, res) => {
  const index = Number(req.body?.index);
  if (!Number.isInteger(index) || index < 0 || index >= CELLS) throw bad('Ungültiges Feld');
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const s = game.state;
    if (s.revealed.includes(index)) throw bad('Feld bereits aufgedeckt');
    if (s.mines.includes(index)) {
      s.status = 'lost';
      s.hit = index;
      s.payout = 0;
      return { game, balance: finishGame(game, 0, { result: 'boom', revealed: s.revealed.length, mines: s.mineCount }) };
    }
    s.revealed.push(index);
    if (s.revealed.length === CELLS - s.mineCount) {
      const m = multiplier(s.revealed.length, s.mineCount);
      s.status = 'won';
      s.payout = Math.floor(game.bet * m);
      return { game, balance: finishGame(game, s.payout, { result: 'cleared', multiplier: m, mines: s.mineCount }) };
    }
    saveGame(game);
    return { game, balance: undefined };
  });
  res.json({ game: publicState(out.game, out.balance) });
});

minesRouter.post('/cashout', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const s = game.state;
    if (s.revealed.length === 0) throw bad('Decke zuerst mindestens ein Feld auf');
    const m = multiplier(s.revealed.length, s.mineCount);
    s.status = 'won';
    s.payout = Math.floor(game.bet * m);
    return { game, balance: finishGame(game, s.payout, { result: 'cashout', multiplier: m, mines: s.mineCount }) };
  });
  res.json({ game: publicState(out.game, out.balance) });
});
