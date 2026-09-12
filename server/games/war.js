import { Router } from 'express';
import { newShoe } from './cards.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, saveGame, finishGame, transaction, debit } from './common.js';
import { bad } from '../util.js';

/**
 * Casino War: je eine Karte für Spieler und Dealer, die höhere gewinnt (Farbe egal).
 * Bei Gleichstand bleibt das Spiel aktiv (status 'tie'): Krieg (zweiter Einsatz in Höhe der Ante,
 * drei Karten verbrennen, je eine neue Karte) oder Aufgeben (halbe Ante zurück).
 */
const TYPE = 'war';
const BURN = 3;

/** Kartenwert für den Vergleich: 2..10, J=11, Q=12, K=13, A=14 */
export const cardValue = (card) => (card.r === 1 ? 14 : card.r);

/** Auszahlung beim Aufgeben: halbe Ante (abgerundet auf ganze Cent) */
export const surrenderPayout = (ante) => Math.floor(ante / 2);

/**
 * Reine Spiellogik: Vergleich zweier Karten.
 *  phase 'start' (Einsatz = ante):   win → 2×ante | lose → 0 | Gleichstand → status 'tie' (Spiel läuft weiter)
 *  phase 'war'   (Einsatz = 2×ante): war_win → 3×ante | war_tie → 4×ante (Bonus 2:1) | war_lose → 0
 * Liefert { status: 'finished'|'tie', result, payout } – bei 'tie' sind result und payout null.
 */
export function resolveWar(playerCard, dealerCard, ante, phase = 'start') {
  const p = cardValue(playerCard);
  const d = cardValue(dealerCard);
  if (phase === 'war') {
    if (p > d) return { status: 'finished', result: 'war_win', payout: ante * 3 };
    if (p < d) return { status: 'finished', result: 'war_lose', payout: 0 };
    return { status: 'finished', result: 'war_tie', payout: ante * 4 };
  }
  if (p > d) return { status: 'finished', result: 'win', payout: ante * 2 };
  if (p < d) return { status: 'finished', result: 'lose', payout: 0 };
  return { status: 'tie', result: null, payout: null };
}

/**
 * Ganze Runde mit einer Kartenquelle draw() – für Simulationen (kein HTTP, keine Datenbank).
 * strategy 'war' (bei Gleichstand immer Krieg) | 'surrender' (immer aufgeben).
 * Liefert { wagered, payout, result }.
 */
export function simulateRound(draw, ante, strategy = 'war') {
  const first = resolveWar(draw(), draw(), ante, 'start');
  if (first.status === 'finished') return { wagered: ante, payout: first.payout, result: first.result };
  if (strategy === 'surrender') return { wagered: ante, payout: surrenderPayout(ante), result: 'surrender' };
  for (let i = 0; i < BURN; i++) draw();
  const war = resolveWar(draw(), draw(), ante, 'war');
  return { wagered: ante * 2, payout: war.payout, result: war.result };
}

function publicState(game, balance) {
  const s = game.state;
  return {
    id: game.id,
    ante: s.ante,
    bet: game.bet,
    status: s.status,
    player: s.player,
    dealer: s.dealer,
    burned: s.burned.length,
    result: s.result ?? null,
    payout: s.payout ?? null,
    balance,
  };
}

/** Schließt das Spiel ab (innerhalb einer Transaktion aufrufen). */
function finish(game, result, payout) {
  const s = game.state;
  s.status = 'finished';
  s.result = result;
  s.payout = payout;
  const meta = {
    result,
    multiplier: payout / game.bet,
    player: cardValue(s.player[s.player.length - 1]),
    dealer: cardValue(s.dealer[s.dealer.length - 1]),
    war: s.player.length > 1,
  };
  return finishGame(game, payout, meta);
}

export const warRouter = Router();

warRouter.get('/current', (req, res) => {
  const g = getActiveGame(req.user.id, TYPE);
  res.json({ game: g ? publicState(g) : null });
});

warRouter.post('/start', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const deck = newShoe(6);
  const state = { deck, player: [deck.pop()], dealer: [deck.pop()], ante: bet, burned: [], status: 'tie' };
  const first = resolveWar(state.player[0], state.dealer[0], bet, 'start');
  state.status = first.status; // nur bei echtem Gleichstand bleibt 'tie' (Krieg/Aufgeben erlaubt)
  const game = startGame(req.user.id, TYPE, bet, state);
  let balance = game.balance;
  if (first.status === 'finished') {
    balance = transaction(() => finish(game, first.result, first.payout));
  }
  res.json({ game: publicState(game, balance) });
});

warRouter.post('/war', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const s = game.state;
    if (s.status !== 'tie') throw bad('Krieg ist nur bei Gleichstand möglich');
    debit(req.user.id, s.ante);
    game.bet = s.ante * 2;
    for (let i = 0; i < BURN; i++) s.burned.push(s.deck.pop());
    s.player.push(s.deck.pop());
    s.dealer.push(s.deck.pop());
    const war = resolveWar(s.player[1], s.dealer[1], s.ante, 'war');
    saveGame(game); // Einsatz (2×Ante) persistieren, bevor abgerechnet wird
    return { game, balance: finish(game, war.result, war.payout) };
  });
  res.json({ game: publicState(out.game, out.balance) });
});

warRouter.post('/surrender', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    if (game.state.status !== 'tie') throw bad('Aufgeben ist nur bei Gleichstand möglich');
    return { game, balance: finish(game, 'surrender', surrenderPayout(game.state.ante)) };
  });
  res.json({ game: publicState(out.game, out.balance) });
});
