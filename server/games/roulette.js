import { Router } from 'express';
import { randInt } from './rng.js';
import { parseBet, playOneShot, MIN_BET } from './common.js';
import { bad, toCents } from '../util.js';

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

// Auszahlungsfaktor (inkl. Einsatz) und Gewinnprüfung je Wettart
const BET_TYPES = {
  straight: { pays: 36, wins: (n, v) => n === v, validate: (v) => Number.isInteger(v) && v >= 0 && v <= 36 },
  red: { pays: 2, wins: (n) => colorOf(n) === 'red' },
  black: { pays: 2, wins: (n) => colorOf(n) === 'black' },
  odd: { pays: 2, wins: (n) => n !== 0 && n % 2 === 1 },
  even: { pays: 2, wins: (n) => n !== 0 && n % 2 === 0 },
  low: { pays: 2, wins: (n) => n >= 1 && n <= 18 },
  high: { pays: 2, wins: (n) => n >= 19 && n <= 36 },
  dozen: { pays: 3, wins: (n, v) => n !== 0 && Math.ceil(n / 12) === v, validate: (v) => [1, 2, 3].includes(v) },
  column: { pays: 3, wins: (n, v) => n !== 0 && ((n - 1) % 3) + 1 === v, validate: (v) => [1, 2, 3].includes(v) },
};

export function parseRouletteBets(input) {
  if (!Array.isArray(input) || input.length === 0) throw bad('Bitte mindestens eine Wette setzen');
  if (input.length > 40) throw bad('Zu viele Wetten');
  const bets = input.map((b) => {
    const def = BET_TYPES[b?.type];
    if (!def) throw bad('Unbekannte Wettart');
    const value = b.value == null ? null : Number(b.value);
    if (def.validate && !def.validate(value)) throw bad('Ungültiger Wettwert');
    return { type: b.type, value, amount: toCents(b.amount, { min: MIN_BET }) };
  });
  return bets;
}

export function evaluateRoulette(bets, number) {
  let payout = 0;
  const results = bets.map((b) => {
    const def = BET_TYPES[b.type];
    const won = def.wins(number, b.value);
    const win = won ? b.amount * def.pays : 0;
    payout += win;
    return { ...b, won, win };
  });
  return { results, payout };
}

export const rouletteRouter = Router();

rouletteRouter.post('/spin', (req, res) => {
  const bets = parseRouletteBets(req.body?.bets);
  const total = bets.reduce((s, b) => s + b.amount, 0);
  parseBet(total);
  const result = playOneShot(req.user.id, 'roulette', total, () => {
    const number = randInt(0, 37);
    const { results, payout } = evaluateRoulette(bets, number);
    return { number, color: colorOf(number), bets: results, payout, meta: { number } };
  });
  res.json(result);
});
