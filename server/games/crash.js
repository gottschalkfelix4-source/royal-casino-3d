import { Router } from 'express';
import { random } from './rng.js';
import { parseBet, startGame, requireActiveGame, getActiveGame, finishGame, transaction } from './common.js';
import { bad } from '../util.js';

const TYPE = 'crash';
export const GROWTH = 0.1; // Wachstumsrate pro Sekunde: m(t) = e^(0.1·t)
export const MAX_MULTIPLIER = 5000;

export const multiplierAt = (ms) => Math.min(MAX_MULTIPLIER, Math.floor(Math.exp((GROWTH * ms) / 1000) * 100) / 100);
export const timeForMultiplier = (m) => (Math.log(m) / GROWTH) * 1000;

/** Hausvorteil 2 %: P(Crash ≥ m) ≈ 0.98 / m */
export function generateCrashPoint() {
  const u = random();
  return Math.min(MAX_MULTIPLIER, Math.max(1, Math.floor(98 / u) / 100));
}

/** Wertet den Zustand zum Zeitpunkt now aus und schließt ggf. ab (in Transaktion). */
function evaluate(game, now) {
  const s = game.state;
  const elapsed = now - s.startedAt;
  const crashMs = timeForMultiplier(s.crashPoint);

  if (s.autoCashout && s.autoCashout < s.crashPoint && timeForMultiplier(s.autoCashout) <= elapsed) {
    return settle(game, 'cashed', s.autoCashout);
  }
  if (elapsed >= crashMs) return settle(game, 'crashed', 0);
  return { status: 'running', elapsed };
}

function settle(game, status, multiplier) {
  const s = game.state;
  s.status = status;
  s.multiplier = multiplier;
  const payout = status === 'cashed' ? Math.floor(game.bet * multiplier) : 0;
  const balance = finishGame(game, payout, { crashPoint: s.crashPoint, multiplier, result: status });
  return { status, multiplier, crashPoint: s.crashPoint, payout, balance };
}

export const crashRouter = Router();

crashRouter.get('/config', (req, res) => res.json({ growth: GROWTH, maxMultiplier: MAX_MULTIPLIER }));

crashRouter.get('/current', (req, res) => {
  const now = Date.now();
  const out = transaction(() => {
    const g = getActiveGame(req.user.id, TYPE);
    if (!g) return null;
    const ev = evaluate(g, now);
    return { roundId: g.id, bet: g.bet, startedAt: g.state.startedAt, autoCashout: g.state.autoCashout, serverNow: now, ...ev };
  });
  res.json({ round: out });
});

crashRouter.post('/start', (req, res) => {
  const bet = parseBet(req.body?.bet);
  let autoCashout = null;
  if (req.body?.autoCashout != null && req.body.autoCashout !== '') {
    autoCashout = Math.round(Number(req.body.autoCashout) * 100) / 100;
    if (!Number.isFinite(autoCashout) || autoCashout < 1.01 || autoCashout > MAX_MULTIPLIER) {
      throw bad('Auto-Cashout muss zwischen 1.01 und 5000 liegen');
    }
  }
  const now = Date.now();
  const state = { startedAt: now, crashPoint: generateCrashPoint(), autoCashout, status: 'running' };
  const game = startGame(req.user.id, TYPE, bet, state);
  res.json({ roundId: game.id, bet, startedAt: now, serverNow: now, autoCashout, balance: game.balance });
});

crashRouter.post('/cashout', (req, res) => {
  const now = Date.now();
  const out = transaction(() => {
    const game = requireActiveGame(req.user.id, TYPE);
    const ev = evaluate(game, now);
    if (ev.status !== 'running') return ev;
    return settle(game, 'cashed', multiplierAt(ev.elapsed));
  });
  res.json(out);
});

crashRouter.get('/state', (req, res) => {
  const now = Date.now();
  const out = transaction(() => {
    const game = getActiveGame(req.user.id, TYPE);
    if (!game) throw bad('Kein laufendes Spiel');
    return evaluate(game, now);
  });
  res.json(out);
});
