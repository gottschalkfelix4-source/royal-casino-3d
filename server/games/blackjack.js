import { Router } from 'express';
import { newShoe, blackjackValue } from './cards.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, saveGame, finishGame, transaction, debit } from './common.js';
import { bad } from '../util.js';

const TYPE = 'blackjack';

function publicState(game, balance) {
  const s = game.state;
  const reveal = s.status !== 'player';
  const dealer = reveal ? s.dealer : [s.dealer[0], { hidden: true }];
  return {
    id: game.id,
    bet: game.bet,
    status: s.status,
    player: s.player,
    playerValue: blackjackValue(s.player).total,
    dealer,
    dealerValue: blackjackValue(reveal ? s.dealer : [s.dealer[0]]).total,
    result: s.result ?? null,
    payout: s.payout ?? null,
    canDouble: s.status === 'player' && s.player.length === 2,
    balance,
  };
}

function resolve(game) {
  const s = game.state;
  const p = blackjackValue(s.player).total;
  const d = blackjackValue(s.dealer).total;
  const playerBJ = s.player.length === 2 && p === 21 && !s.doubled;
  const dealerBJ = s.dealer.length === 2 && d === 21;
  let result;
  let payout;
  if (p > 21) { result = 'bust'; payout = 0; }
  else if (playerBJ && dealerBJ) { result = 'push'; payout = game.bet; }
  else if (playerBJ) { result = 'blackjack'; payout = Math.floor(game.bet * 2.5); }
  else if (dealerBJ) { result = 'dealer_blackjack'; payout = 0; }
  else if (d > 21) { result = 'dealer_bust'; payout = game.bet * 2; }
  else if (p > d) { result = 'win'; payout = game.bet * 2; }
  else if (p < d) { result = 'lose'; payout = 0; }
  else { result = 'push'; payout = game.bet; }
  s.status = 'finished';
  s.result = result;
  s.payout = payout;
  return finishGame(game, payout, { result, player: p, dealer: d, multiplier: payout / game.bet });
}

function dealerPlay(game) {
  const s = game.state;
  while (blackjackValue(s.dealer).total < 17) s.dealer.push(s.deck.pop());
}

export const blackjackRouter = Router();

blackjackRouter.get('/current', (req, res) => {
  const g = getActiveGame(req.user.id, TYPE);
  res.json({ game: g ? publicState(g) : null });
});

blackjackRouter.post('/start', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const deck = newShoe(6);
  const state = { deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], status: 'player', doubled: false };
  let game = startGame(req.user.id, TYPE, bet, state);
  let balance = game.balance;
  const p = blackjackValue(state.player).total;
  const d = blackjackValue(state.dealer).total;
  if (p === 21 || d === 21) {
    balance = transaction(() => resolve(game));
  } else {
    saveGame(game);
  }
  res.json({ game: publicState(game, balance) });
});

blackjackRouter.post('/hit', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    if (game.state.status !== 'player') throw bad('Keine Aktion möglich');
    game.state.player.push(game.state.deck.pop());
    const total = blackjackValue(game.state.player).total;
    if (total >= 21) {
      if (total === 21) dealerPlay(game);
      return { game, balance: resolve(game) };
    }
    saveGame(game);
    return { game, balance: undefined };
  });
  res.json({ game: publicState(out.game, out.balance) });
});

blackjackRouter.post('/stand', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    if (game.state.status !== 'player') throw bad('Keine Aktion möglich');
    dealerPlay(game);
    return { game, balance: resolve(game) };
  });
  res.json({ game: publicState(out.game, out.balance) });
});

blackjackRouter.post('/double', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    if (game.state.status !== 'player' || game.state.player.length !== 2) throw bad('Verdoppeln nicht möglich');
    debit(req.user.id, game.bet);
    game.bet *= 2;
    game.state.doubled = true;
    game.state.player.push(game.state.deck.pop());
    if (blackjackValue(game.state.player).total <= 21) dealerPlay(game);
    return { game, balance: resolve(game) };
  });
  res.json({ game: publicState(out.game, out.balance) });
});
