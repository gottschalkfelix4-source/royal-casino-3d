import { Router } from 'express';
import { randInt } from './rng.js';
import { parseBet, playOneShot, MIN_BET } from './common.js';
import { bad, toCents } from '../util.js';

// Sic-Bo-Stil mit drei Würfeln. pays = Auszahlungsfaktor inkl. Einsatz
export const TOTAL_PAYS = { 4: 61, 5: 31, 6: 18, 7: 13, 8: 9, 9: 7, 10: 7, 11: 7, 12: 7, 13: 9, 14: 13, 15: 18, 16: 31, 17: 61 };

const BET_TYPES = {
  small: { pays: 2, wins: (d, sum, triple) => !triple && sum >= 4 && sum <= 10 },
  big: { pays: 2, wins: (d, sum, triple) => !triple && sum >= 11 && sum <= 17 },
  odd: { pays: 2, wins: (d, sum, triple) => !triple && sum % 2 === 1 },
  even: { pays: 2, wins: (d, sum, triple) => !triple && sum % 2 === 0 },
  triple: { pays: 31, wins: (d, sum, triple) => triple },
  total: { pays: (v) => TOTAL_PAYS[v], wins: (d, sum, triple, v) => sum === v, validate: (v) => v in TOTAL_PAYS },
};

export const diceRouter = Router();

diceRouter.post('/roll', (req, res) => {
  const input = req.body?.bets;
  if (!Array.isArray(input) || input.length === 0) throw bad('Bitte mindestens eine Wette setzen');
  if (input.length > 20) throw bad('Zu viele Wetten');
  const bets = input.map((b) => {
    const def = BET_TYPES[b?.type];
    if (!def) throw bad('Unbekannte Wettart');
    const value = b.value == null ? null : Number(b.value);
    if (def.validate && !def.validate(value)) throw bad('Ungültiger Wettwert');
    return { type: b.type, value, amount: toCents(b.amount, { min: MIN_BET }) };
  });
  const total = bets.reduce((s, b) => s + b.amount, 0);
  parseBet(total);

  const result = playOneShot(req.user.id, 'dice', total, () => {
    const dice = [randInt(1, 7), randInt(1, 7), randInt(1, 7)];
    const sum = dice[0] + dice[1] + dice[2];
    const triple = dice[0] === dice[1] && dice[1] === dice[2];
    let payout = 0;
    const results = bets.map((b) => {
      const def = BET_TYPES[b.type];
      const won = def.wins(dice, sum, triple, b.value);
      const pays = typeof def.pays === 'function' ? def.pays(b.value) : def.pays;
      const win = won ? b.amount * pays : 0;
      payout += win;
      return { ...b, won, win };
    });
    return { dice, sum, triple, bets: results, payout, meta: { dice } };
  });
  res.json(result);
});
