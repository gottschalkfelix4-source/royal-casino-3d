import { shuffle, randInt } from './rng.js';

export const SUITS = ['S', 'H', 'D', 'C'];

/** Karte: { r: 1..13 (A=1, J=11, Q=12, K=13), s: 'S'|'H'|'D'|'C' } */
export function newShoe(decks = 1) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (let r = 1; r <= 13; r++) cards.push({ r, s });
  }
  return shuffle(cards);
}

export const randomCard = () => ({ r: randInt(1, 14), s: SUITS[randInt(0, 4)] });

// ---------- Blackjack ----------
export function blackjackValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 1) { aces++; total += 11; }
    else total += Math.min(c.r, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

// ---------- Baccarat ----------
export const baccaratValue = (cards) =>
  cards.reduce((sum, c) => sum + (c.r >= 10 ? 0 : c.r), 0) % 10;

// ---------- Poker (5 Karten) ----------
export const POKER_RANKS = [
  'high_card', 'jacks_or_better', 'two_pair', 'three_of_a_kind', 'straight',
  'flush', 'full_house', 'four_of_a_kind', 'straight_flush', 'royal_flush',
];

export function evaluatePoker(hand) {
  const counts = new Map();
  for (const c of hand) counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((c) => c.s === hand[0].s);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  let straight = false;
  if (ranks.length === 5) {
    straight = ranks[4] - ranks[0] === 4;
    // A-10-J-Q-K (Ass hoch)
    if (!straight && ranks[0] === 1 && ranks[1] === 10 && ranks[4] === 13) straight = true;
  }
  const aceHigh = straight && ranks[0] === 1 && ranks[1] === 10;

  if (straight && flush && aceHigh) return 'royal_flush';
  if (straight && flush) return 'straight_flush';
  if (groups[0] === 4) return 'four_of_a_kind';
  if (groups[0] === 3 && groups[1] === 2) return 'full_house';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'three_of_a_kind';
  if (groups[0] === 2 && groups[1] === 2) return 'two_pair';
  if (groups[0] === 2) {
    const pairRank = [...counts.entries()].find(([, n]) => n === 2)[0];
    if (pairRank === 1 || pairRank >= 11) return 'jacks_or_better';
  }
  return 'high_card';
}
