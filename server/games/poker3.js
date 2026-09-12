import { Router } from 'express';
import { newShoe } from './cards.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, saveGame, finishGame, transaction, debit } from './common.js';
import { bad, toCents } from '../util.js';

/**
 * Three Card Poker gegen den Dealer: Ante (Pflicht) + Pair Plus (optional), dann SPIELEN (zweiter Einsatz
 * in Höhe der Ante) oder PASSEN. Dealer qualifiziert sich mit Dame hoch oder besser.
 * Alle Beträge in Cent, Zufall nur über newShoe() (rng.js).
 */
const TYPE = 'poker3';

export const CATEGORY_NAMES = ['Hohe Karte', 'Paar', 'Flush', 'Straße', 'Drilling', 'Straight Flush'];
/** Ante-Bonus (x : 1 auf die Ante, nur bei SPIELEN, unabhängig vom Dealer) je Kategorie */
export const ANTE_BONUS = { 3: 1, 4: 4, 5: 5 };
/** Pair Plus (x : 1 auf den Pair-Plus-Einsatz, bei SPIELEN und PASSEN) je Kategorie */
export const PAIR_PLUS = { 1: 1, 2: 4, 3: 6, 4: 30, 5: 40 };
/** Pair Plus darf höchstens das Fünffache der Ante betragen */
export const MAX_PAIRPLUS_FACTOR = 5;

const value = (c) => (c.r === 1 ? 14 : c.r); // Ass zählt hoch

/**
 * Bewertet ein 3-Karten-Blatt.
 * category: 0 Hohe Karte, 1 Paar, 2 Flush, 3 Straße, 4 Drilling, 5 Straight Flush.
 * key: [category, ...Ränge] – lexikografisch vergleichbar, höher = besser.
 * A-2-3 ist die niedrigste Straße (Schlüssel 3), Q-K-A die höchste (Schlüssel 14).
 */
export function rank3(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) throw new Error('rank3 erwartet genau 3 Karten');
  const v = cards.map(value).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const wheel = v[0] === 14 && v[1] === 3 && v[2] === 2;
  const straight = wheel || (v[0] - v[1] === 1 && v[1] - v[2] === 1);
  const trips = v[0] === v[2];
  const pairRank = v[0] === v[1] ? v[0] : v[1] === v[2] ? v[1] : 0;
  let category; let key;
  if (straight && flush) { category = 5; key = [wheel ? 3 : v[0]]; }
  else if (trips) { category = 4; key = [v[0]]; }
  else if (straight) { category = 3; key = [wheel ? 3 : v[0]]; }
  else if (flush) { category = 2; key = v; }
  else if (pairRank) { category = 1; key = [pairRank, v.find((x) => x !== pairRank)]; }
  else { category = 0; key = v; }
  return { category, name: CATEGORY_NAMES[category], key: [category, ...key] };
}

const keyOf = (x) => (Array.isArray(x) ? rank3(x).key : x.key);

/** Vergleicht zwei Blätter (Karten-Arrays oder rank3-Ergebnisse): -1 a schlechter, 0 gleich, 1 a besser */
export function compare3(a, b) {
  const ka = keyOf(a); const kb = keyOf(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const x = ka[i] ?? 0; const y = kb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** Dealer qualifiziert sich mit Dame hoch oder besser */
export const dealerQualifies = (rank) => rank.category > 0 || rank.key[1] >= 12;

/**
 * Reine Auswertung einer Runde.
 * state: { player, dealer, ante, pairplus }; action: 'play' | 'fold'.
 * Liefert { result, payout, anteBonus, pairPlusWin, playerRank, dealerRank, dealerQualifies }.
 * payout enthält alle Rückgaben (Ante, Play, Pair Plus) plus Gewinne.
 */
export function settle(state, action) {
  const ante = state.ante;
  const pairplus = state.pairplus ?? 0;
  const playerRank = rank3(state.player);
  const dealerRank = rank3(state.dealer);
  const qualifies = dealerQualifies(dealerRank);
  const ppMult = PAIR_PLUS[playerRank.category] ?? 0;
  const pairPlusWin = ppMult ? pairplus * (ppMult + 1) : 0; // Gewinn plus Rückgabe des Einsatzes
  const base = { anteBonus: 0, pairPlusWin, playerRank, dealerRank, dealerQualifies: qualifies };
  if (action === 'fold') return { ...base, result: 'fold', payout: pairPlusWin };
  if (action !== 'play') throw new Error('Unbekannte Aktion');
  const anteBonus = ante * (ANTE_BONUS[playerRank.category] ?? 0);
  let result; let main;
  if (!qualifies) { result = 'no_qualify'; main = ante * 3; } // Ante 1:1 (+ Rückgabe) + Play zurück
  else {
    const c = compare3(playerRank, dealerRank);
    if (c > 0) { result = 'win'; main = ante * 4; } // Ante 1:1 + Play 1:1 (jeweils inkl. Rückgabe)
    else if (c < 0) { result = 'lose'; main = 0; }
    else { result = 'push'; main = ante * 2; } // beide Einsätze zurück
  }
  return { ...base, result, anteBonus, payout: main + anteBonus + pairPlusWin };
}

/** Neue Runde: 3 Karten Spieler, 3 Karten Dealer aus einem frisch gemischten 52er-Deck */
export function dealRound() {
  const deck = newShoe(1);
  const player = [deck.pop(), deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop(), deck.pop()];
  return { deck, player, dealer };
}

const publicRank = (r) => ({ category: r.category, name: r.name });

function publicState(game, balance) {
  const s = game.state;
  const finished = s.status === 'finished';
  return {
    id: game.id,
    ante: s.ante,
    pairplus: s.pairplus,
    bet: game.bet,
    status: s.status,
    player: s.player,
    playerRank: publicRank(rank3(s.player)),
    dealer: finished ? s.dealer : [{ hidden: true }, { hidden: true }, { hidden: true }],
    dealerRank: finished ? publicRank(rank3(s.dealer)) : null,
    dealerQualifies: finished ? s.dealerQualifies : null,
    result: s.result ?? null,
    anteBonus: s.anteBonus ?? 0,
    pairPlusWin: s.pairPlusWin ?? 0,
    payout: s.payout ?? null,
    balance,
  };
}

/** Wertet das Spiel aus, schreibt das Ergebnis in den Zustand und bucht die Auszahlung (in Transaktion aufrufen) */
function resolve(game, action) {
  const s = game.state;
  const r = settle(s, action);
  s.status = 'finished';
  s.result = r.result;
  s.anteBonus = r.anteBonus;
  s.pairPlusWin = r.pairPlusWin;
  s.dealerQualifies = r.dealerQualifies;
  s.payout = r.payout;
  return finishGame(game, r.payout, {
    result: r.result, multiplier: r.payout / game.bet, action,
    player: r.playerRank.name, dealer: r.dealerRank.name, anteBonus: r.anteBonus, pairPlusWin: r.pairPlusWin,
  });
}

export const poker3Router = Router();

poker3Router.get('/current', (req, res) => {
  const g = getActiveGame(req.user.id, TYPE);
  res.json({ game: g ? publicState(g) : null });
});

poker3Router.post('/start', (req, res) => {
  const ante = parseBet(req.body?.bet);
  const raw = req.body?.pairplus;
  const pairplus = raw == null || raw === '' ? 0 : toCents(raw, { min: 0, max: ante * MAX_PAIRPLUS_FACTOR });
  const { deck, player, dealer } = dealRound();
  const state = { deck, player, dealer, ante, pairplus, status: 'decide' };
  const game = startGame(req.user.id, TYPE, ante + pairplus, state);
  res.json({ game: publicState(game, game.balance) });
});

poker3Router.post('/play', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    if (game.state.status !== 'decide') throw bad('Keine Aktion möglich');
    debit(req.user.id, game.state.ante); // zweiter Einsatz in Höhe der Ante
    game.bet += game.state.ante;
    saveGame(game);
    return { game, balance: resolve(game, 'play') };
  });
  res.json({ game: publicState(out.game, out.balance) });
});

poker3Router.post('/fold', (req, res) => {
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    if (game.state.status !== 'decide') throw bad('Keine Aktion möglich');
    return { game, balance: resolve(game, 'fold') };
  });
  res.json({ game: publicState(out.game, out.balance) });
});
