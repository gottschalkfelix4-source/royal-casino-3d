import { Router } from 'express';
import { random, shuffle } from './rng.js';
import { parseBet, playOneShot } from './common.js';
import { bad } from '../util.js';

/**
 * Derby: sechs Pferde mit festen Quoten (Dezimalquote inkl. Einsatz) laufen ein Rennen.
 * Der Spieler wettet auf den Sieger; gewinnt sein Pferd, zahlt es Quote × Einsatz.
 *
 * Die Gewinnwahrscheinlichkeiten sind so gesetzt, dass jedes Pferd denselben RTP hat:
 *   p_i = (1/Quote_i) / Σ(1/Quote_j)   ⇒   RTP = 1 / Σ(1/Quote_j) ≈ 92,3 %.
 */

export const HORSES = [
  { id: 1, name: 'Roter Blitz', color: '#e23b2e', odds: 2.5 },
  { id: 2, name: 'Goldfuchs', color: '#e0a324', odds: 3.7 },
  { id: 3, name: 'Silberpfeil', color: '#c7ccd6', odds: 5.6 },
  { id: 4, name: 'Nachtfalke', color: '#5566a0', odds: 8.5 },
  { id: 5, name: 'Grüne Welle', color: '#2f9e57', odds: 14.0 },
  { id: 6, name: 'Außenseiter', color: '#8a4bd0', odds: 22.0 },
];

const INV_SUM = HORSES.reduce((s, h) => s + 1 / h.odds, 0);

/** Auszahlungsquote (identisch für alle Pferde) */
export const RTP = 1 / INV_SUM;

/** Gewinnwahrscheinlichkeit je Pferd, Index wie HORSES */
export const winProbabilities = () => HORSES.map((h) => (1 / h.odds) / INV_SUM);

/** Sieger per Gewichtung ziehen (id) */
export function drawWinner() {
  let r = random(); // (0, 1]
  for (let i = 0; i < HORSES.length; i++) {
    r -= (1 / HORSES[i].odds) / INV_SUM;
    if (r <= 0) return HORSES[i].id;
  }
  return HORSES[HORSES.length - 1].id;
}

/** Vollständige Zielreihenfolge: gewichteter Sieger, der Rest zufällig gemischt */
export function raceOrder() {
  const winner = drawWinner();
  return [winner, ...shuffle(HORSES.map((h) => h.id).filter((id) => id !== winner))];
}

export const derbyRouter = Router();

derbyRouter.get('/config', (req, res) => {
  res.json({ horses: HORSES, rtp: RTP });
});

derbyRouter.post('/race', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const horse = Number(req.body?.horse);
  const pickHorse = HORSES.find((h) => h.id === horse);
  if (!pickHorse) throw bad('Bitte ein gültiges Pferd wählen');
  const result = playOneShot(req.user.id, 'derby', bet, () => {
    const order = raceOrder();
    const winner = order[0];
    const won = winner === horse;
    const payout = won ? Math.floor(bet * pickHorse.odds) : 0;
    return {
      order, winner, horse, odds: pickHorse.odds, won, payout,
      meta: { result: won ? 'win' : 'lose', multiplier: won ? pickHorse.odds : 0, horse, winner },
    };
  });
  res.json(result);
});
