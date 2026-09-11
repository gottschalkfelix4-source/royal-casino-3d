import { Router } from 'express';
import { randomCard } from './cards.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, saveGame, finishGame, transaction } from './common.js';
import { bad } from '../util.js';

const TYPE = 'hilo';
const EDGE = 0.98;

/** Chancen und Multiplikatoren für "höher oder gleich" / "niedriger oder gleich" (unendliches Deck) */
export function odds(rank) {
  const pHigher = (14 - rank) / 13;
  const pLower = rank / 13;
  const m = (p) => Math.round((EDGE / p) * 100) / 100;
  return { higher: { p: pHigher, mult: m(pHigher) }, lower: { p: pLower, mult: m(pLower) } };
}

function publicState(game, balance) {
  const s = game.state;
  return {
    id: game.id, bet: game.bet, status: s.status, card: s.card, history: s.history,
    multiplier: s.multiplier, odds: odds(s.card.r), canCashout: s.status === 'active' && s.history.length > 0,
    lastCard: s.lastCard ?? null, payout: s.payout ?? null, balance,
  };
}

export const hiloRouter = Router();

hiloRouter.get('/current', (req, res) => {
  const g = getActiveGame(req.user.id, TYPE);
  res.json({ game: g ? publicState(g) : null });
});

hiloRouter.post('/start', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const game = startGame(req.user.id, TYPE, bet, { card: randomCard(), history: [], multiplier: 1, status: 'active' });
  res.json({ game: publicState(game, game.balance) });
});

hiloRouter.post('/skip', (req, res) => {
  const game = requireActiveGame(req.user.id, TYPE);
  if (game.state.history.length > 0) throw bad('Überspringen nur vor dem ersten Tipp');
  game.state.card = randomCard();
  saveGame(game);
  res.json({ game: publicState(game) });
});

hiloRouter.post('/guess', (req, res) => {
  const choice = req.body?.choice;
  if (choice !== 'higher' && choice !== 'lower') throw bad('Bitte höher oder niedriger wählen');
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const s = game.state;
    const o = odds(s.card.r)[choice];
    const next = randomCard();
    const won = choice === 'higher' ? next.r >= s.card.r : next.r <= s.card.r;
    s.history.push({ card: s.card, choice, next, won });
    s.lastCard = s.card;
    s.card = next;
    if (!won) {
      s.status = 'lost';
      s.payout = 0;
      return { game, balance: finishGame(game, 0, { result: 'lost', steps: s.history.length }) };
    }
    s.multiplier = Math.round(s.multiplier * o.mult * 10000) / 10000;
    if (s.multiplier * game.bet > 1_000_000_00) {
      s.status = 'won';
      s.payout = Math.floor(game.bet * s.multiplier);
      return { game, balance: finishGame(game, s.payout, { result: 'max', multiplier: s.multiplier }) };
    }
    saveGame(game);
    return { game, balance: undefined };
  });
  res.json({ game: publicState(out.game, out.balance) });
});

hiloRouter.post('/cashout', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const s = game.state;
    if (s.history.length === 0) throw bad('Mindestens ein richtiger Tipp nötig');
    s.status = 'won';
    s.payout = Math.floor(game.bet * s.multiplier);
    return { game, balance: finishGame(game, s.payout, { result: 'cashout', multiplier: s.multiplier, steps: s.history.length }) };
  });
  res.json({ game: publicState(out.game, out.balance) });
});
