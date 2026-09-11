import { Router } from 'express';
import { newShoe, evaluatePoker } from './cards.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, finishGame, transaction } from './common.js';
import { bad } from '../util.js';

const TYPE = 'videopoker';

// Jacks or Better (9/6) – Vielfaches des Einsatzes
export const PAYTABLE = {
  royal_flush: 800, straight_flush: 50, four_of_a_kind: 25, full_house: 9, flush: 6,
  straight: 4, three_of_a_kind: 3, two_pair: 2, jacks_or_better: 1, high_card: 0,
};

function publicState(game, balance) {
  const s = game.state;
  return {
    id: game.id, bet: game.bet, status: s.status, hand: s.hand,
    result: s.result ?? null, payout: s.payout ?? null, replaced: s.replaced ?? null, balance,
  };
}

export const videopokerRouter = Router();

videopokerRouter.get('/config', (req, res) => res.json({ paytable: PAYTABLE }));

videopokerRouter.get('/current', (req, res) => {
  const g = getActiveGame(req.user.id, TYPE);
  res.json({ game: g ? publicState(g) : null });
});

videopokerRouter.post('/deal', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const deck = newShoe(1);
  const state = { deck, hand: deck.splice(0, 5), status: 'hold' };
  const game = startGame(req.user.id, TYPE, bet, state);
  res.json({ game: publicState(game, game.balance) });
});

videopokerRouter.post('/draw', (req, res) => {
  const hold = req.body?.hold;
  if (!Array.isArray(hold) || hold.length !== 5) throw bad('Ungültige Auswahl');
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const s = game.state;
    const replaced = [];
    for (let i = 0; i < 5; i++) {
      if (!hold[i]) { s.hand[i] = s.deck.shift(); replaced.push(i); }
    }
    const rank = evaluatePoker(s.hand);
    const payout = Math.floor(game.bet * PAYTABLE[rank]);
    s.status = 'finished';
    s.result = rank;
    s.payout = payout;
    s.replaced = replaced;
    const balance = finishGame(game, payout, { result: rank, multiplier: PAYTABLE[rank] });
    return { game, balance };
  });
  res.json({ game: publicState(out.game, out.balance) });
});
