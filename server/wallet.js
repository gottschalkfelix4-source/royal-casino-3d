import { Router } from 'express';
import { db, transaction } from './db.js';
import { HttpError } from './util.js';
import { requireAuth } from './auth.js';
import { bus } from './events.js';

// Alle Beträge in Cent
export const START_BALANCE = 10_000_00;
export const DAILY_BONUS = 5_000_00;
export const RESCUE_AMOUNT = 1_000_00;
export const RESCUE_THRESHOLD = 1_00;
export const BONUS_INTERVAL = 24 * 60 * 60 * 1000;
export const RESCUE_INTERVAL = 60 * 60 * 1000;

const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const dailyAmountFor = (u) => {
  const streak = u.last_daily_day === yesterdayStr() ? (u.streak ?? 0) + 1 : 1;
  return Math.min(1500_00, 500_00 + 100_00 * (streak - 1));
};

/** Version der "Was ist neu"-Meldung – bei Änderung sehen alle Nutzer sie einmalig erneut */
export const NEWS_VERSION = '2026-09-rewards';

export function publicUser(u) {
  const now = Date.now();
  const nextBonusAt = new Date(todayStr() + 'T00:00:00Z').getTime() + 86400000;
  const nextRescueAt = (u.last_rescue_at ?? 0) + RESCUE_INTERVAL;
  return {
    id: u.id,
    username: u.username,
    balance: u.balance,
    stats: {
      totalWagered: u.total_wagered,
      totalWon: u.total_won,
      gamesPlayed: u.games_played,
      biggestWin: u.biggest_win,
    },
    createdAt: u.created_at,
    news: u.news_seen === NEWS_VERSION ? null : NEWS_VERSION,
    bonus: {
      available: u.last_daily_day !== todayStr(),
      nextAt: nextBonusAt,
      amount: dailyAmountFor(u),
      streak: u.streak ?? 0,
    },
    rescue: {
      available: u.balance < RESCUE_THRESHOLD && now >= nextRescueAt,
      nextAt: nextRescueAt,
      amount: RESCUE_AMOUNT,
      threshold: RESCUE_THRESHOLD,
    },
  };
}

export const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

const insertTx = db.prepare(`
  INSERT INTO transactions (user_id, type, game, amount, bet, payout, balance_after, meta, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

/** Zieht einen Einsatz ab (innerhalb einer Transaktion aufrufen). Gibt neuen Kontostand zurück. */
export function debit(userId, cents) {
  const u = getUser(userId);
  if (!u) throw new HttpError(401, 'Benutzer nicht gefunden');
  if (u.balance < cents) throw new HttpError(400, 'Nicht genug Guthaben');
  const balance = u.balance - cents;
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, userId);
  return balance;
}

/** Gutschrift (Bonus, Aufgabe, Erfolg, Chip) – innerhalb einer Transaktion aufrufen. */
export function credit(userId, cents, type, meta = {}) {
  const u = getUser(userId);
  const balance = u.balance + cents;
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, userId);
  insertTx.run(userId, type, null, cents, 0, 0, balance, JSON.stringify(meta), Date.now());
  return balance;
}

/**
 * Schließt eine Spielrunde ab: bucht die Auszahlung, schreibt Verlauf + Statistik.
 * Der Einsatz muss vorher bereits per debit() abgezogen worden sein.
 */
export function settleRound(userId, game, bet, payout, meta = {}) {
  const u = getUser(userId);
  const balance = u.balance + payout;
  const now = Date.now();
  db.prepare(`
    UPDATE users SET balance = ?, total_wagered = total_wagered + ?, total_won = total_won + ?,
      games_played = games_played + 1, biggest_win = MAX(biggest_win, ?)
    WHERE id = ?
  `).run(balance, bet, payout, payout, userId);
  insertTx.run(userId, 'round', game, payout - bet, bet, payout, balance, JSON.stringify(meta), now);
  queueMicrotask(() => bus.emit('round', { userId, game, bet, payout, meta, balance }));
  return balance;
}

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get('/', (req, res) => {
  res.json({ user: publicUser(getUser(req.user.id)) });
});

walletRouter.post('/daily-bonus', (req, res) => {
  // Tagesbonus mit Serie: 500 + 100 je Folgetag (max. 1.500), Serie reißt bei verpasstem Tag
  const out = transaction(() => {
    const u = getUser(req.user.id);
    const day = todayStr();
    if (u.last_daily_day === day) throw new HttpError(400, 'Tagesbonus wurde heute bereits abgeholt');
    const streak = u.last_daily_day === yesterdayStr() ? (u.streak ?? 0) + 1 : 1;
    const amount = Math.min(1500_00, 500_00 + 100_00 * (streak - 1));
    db.prepare('UPDATE users SET streak = ?, last_daily_day = ?, last_bonus_at = ? WHERE id = ?').run(streak, day, Date.now(), u.id);
    const balance = credit(u.id, amount, 'bonus', { label: `Tagesbonus (Tag ${streak})`, streak });
    if (streak >= 7) queueMicrotask(() => bus.emit('daily-streak', { userId: u.id, streak })); // nach Commit, nicht verschachtelt
    return { amount, streak, balance };
  });
  res.json({ user: publicUser(getUser(req.user.id)), amount: out.amount, streak: out.streak });
});

walletRouter.post('/rescue', (req, res) => {
  const user = transaction(() => {
    const u = getUser(req.user.id);
    const now = Date.now();
    if (u.balance >= RESCUE_THRESHOLD) throw new HttpError(400, 'Du hast noch genug Guthaben');
    if (now < (u.last_rescue_at ?? 0) + RESCUE_INTERVAL) {
      throw new HttpError(400, 'Notfall-Guthaben ist nur einmal pro Stunde verfügbar');
    }
    const active = db.prepare("SELECT id FROM games WHERE user_id = ? AND status = 'active'").get(u.id);
    if (active) throw new HttpError(400, 'Beende zuerst dein laufendes Spiel');
    const balance = u.balance + RESCUE_AMOUNT;
    db.prepare('UPDATE users SET balance = ?, last_rescue_at = ? WHERE id = ?').run(balance, now, u.id);
    insertTx.run(u.id, 'rescue', null, RESCUE_AMOUNT, 0, 0, balance, JSON.stringify({ label: 'Notfall-Guthaben' }), now);
    return getUser(u.id);
  });
  res.json({ user: publicUser(user), amount: RESCUE_AMOUNT });
});

walletRouter.post('/news-seen', (req, res) => {
  db.prepare('UPDATE users SET news_seen = ? WHERE id = ?').run(NEWS_VERSION, req.user.id);
  res.json({ ok: true });
});

walletRouter.get('/history', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const rows = db.prepare(`
    SELECT id, type, game, amount, bet, payout, balance_after AS balanceAfter, meta, created_at AS createdAt
    FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?
  `).all(req.user.id, limit);
  res.json({ history: rows.map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })) });
});

walletRouter.get('/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT username, balance, games_played AS gamesPlayed, biggest_win AS biggestWin, total_won AS totalWon
    FROM users ORDER BY balance DESC, id ASC LIMIT 25
  `).all();
  const me = db.prepare(
    'SELECT COUNT(*) + 1 AS rank FROM users WHERE balance > (SELECT balance FROM users WHERE id = ?)'
  ).get(req.user.id);
  res.json({ leaderboard: rows, myRank: me.rank });
});
