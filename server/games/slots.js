import { Router } from 'express';
import { randInt } from './rng.js';
import { parseBet, playOneShot } from './common.js';

export const SYMBOLS = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'bar', 'seven', 'diamond', 'wild'];

// Feste Walzenstreifen (wie bei echten Automaten) – 24 Positionen je Walze
export const STRIPS = [
  ['cherry', 'lemon', 'orange', 'plum', 'cherry', 'bell', 'lemon', 'orange', 'cherry', 'bar', 'plum', 'lemon',
    'seven', 'cherry', 'orange', 'diamond', 'lemon', 'plum', 'wild', 'cherry', 'bell', 'orange', 'lemon', 'bar'],
  ['lemon', 'cherry', 'plum', 'orange', 'lemon', 'bar', 'cherry', 'bell', 'orange', 'lemon', 'seven', 'plum',
    'cherry', 'orange', 'wild', 'lemon', 'bell', 'cherry', 'diamond', 'plum', 'orange', 'lemon', 'cherry', 'bar'],
  ['orange', 'lemon', 'cherry', 'bell', 'plum', 'lemon', 'orange', 'cherry', 'bar', 'lemon', 'plum', 'wild',
    'cherry', 'seven', 'orange', 'lemon', 'diamond', 'cherry', 'plum', 'bell', 'orange', 'lemon', 'cherry', 'bar'],
  ['plum', 'cherry', 'lemon', 'orange', 'bar', 'cherry', 'lemon', 'bell', 'plum', 'orange', 'cherry', 'lemon',
    'seven', 'orange', 'plum', 'cherry', 'lemon', 'wild', 'orange', 'diamond', 'cherry', 'lemon', 'bell', 'plum'],
  ['cherry', 'orange', 'lemon', 'plum', 'cherry', 'lemon', 'bar', 'orange', 'cherry', 'plum', 'lemon', 'bell',
    'orange', 'cherry', 'diamond', 'lemon', 'plum', 'seven', 'cherry', 'orange', 'lemon', 'wild', 'bell', 'plum'],
];

// Auszahlung als Vielfaches des Gesamteinsatzes für 3 / 4 / 5 gleiche von links
export const PAYTABLE = {
  cherry: [0.8, 2.5, 8],
  lemon: [0.8, 2.5, 8],
  orange: [1, 3, 12],
  plum: [1.2, 4, 15],
  bell: [2.5, 8, 30],
  bar: [3, 12, 50],
  seven: [6, 25, 100],
  diamond: [12, 50, 250],
  wild: [15, 80, 800],
};

// 9 Gewinnlinien (Zeile je Walze; 0 = oben, 1 = Mitte, 2 = unten)
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1],
];

export function spinReels() {
  return STRIPS.map((strip) => randInt(0, strip.length));
}

/** Sichtbares Raster: grid[reel][row], Zeile 0 = oben. */
export function gridFromStops(stops) {
  return STRIPS.map((strip, i) => {
    const n = strip.length;
    const s = stops[i];
    return [strip[(s + 1) % n], strip[s], strip[(s - 1 + n) % n]];
  });
}

export function evaluateGrid(grid, bet) {
  const wins = [];
  let payout = 0;
  LINES.forEach((line, lineIndex) => {
    const syms = line.map((row, reel) => grid[reel][row]);
    let target = syms.find((s) => s !== 'wild') ?? 'wild';
    let count = 0;
    for (const s of syms) {
      if (s === target || s === 'wild') count++;
      else break;
    }
    let wildCount = 0;
    for (const s of syms) { if (s === 'wild') wildCount++; else break; }

    let best = 0;
    let bestSym = target;
    if (count >= 3) best = PAYTABLE[target][count - 3];
    if (wildCount >= 3 && PAYTABLE.wild[wildCount - 3] > best) {
      best = PAYTABLE.wild[wildCount - 3];
      bestSym = 'wild';
      count = wildCount;
    }
    if (best > 0) {
      const amount = Math.floor(bet * best);
      payout += amount;
      wins.push({ line: lineIndex, symbol: bestSym, count, multiplier: best, amount });
    }
  });
  return { wins, payout };
}

export const slotsRouter = Router();

slotsRouter.get('/config', (req, res) => {
  res.json({ symbols: SYMBOLS, strips: STRIPS, paytable: PAYTABLE, lines: LINES });
});

slotsRouter.post('/spin', (req, res) => {
  const bet = parseBet(req.body?.bet);
  const result = playOneShot(req.user.id, 'slots', bet, () => {
    const stops = spinReels();
    const grid = gridFromStops(stops);
    const { wins, payout } = evaluateGrid(grid, bet);
    return { stops, grid, wins, payout, meta: { wins: wins.length, multiplier: payout / bet } };
  });
  res.json(result);
});
