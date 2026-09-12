import { Router } from 'express';
import { db, transaction } from './db.js';
import { HttpError } from './util.js';
import { requireAuth } from './auth.js';
import { bus } from './events.js';
import { getUser, credit, publicUser } from './wallet.js';
import { GAME_IDS } from './stations.js';

/**
 * Belohnungen: Tagesbonus mit Serie, Tagesaufgaben, Chips-Sammeln in der Halle, Erfolge.
 * Alle Beträge in Cent.
 */
export const DAILY_BASE = 500_00;
export const DAILY_STEP = 100_00;
export const DAILY_MAX = 1500_00;
export const PICKUP_CAP = 500_00;

export const MISSION_POOL = [
  { key: 'rounds5', title: 'Spiele 5 Runden (egal welches Spiel)', type: 'rounds', target: 5, reward: 200_00 },
  { key: 'bj3', title: 'Spiele 3 Runden Blackjack', type: 'rounds', game: 'blackjack', target: 3, reward: 250_00 },
  { key: 'slots10', title: 'Drehe 10-mal an den Slots', type: 'rounds', game: 'slots', target: 10, reward: 250_00 },
  { key: 'roulette2', title: 'Spiele 2 Runden Roulette', type: 'rounds', game: 'roulette', target: 2, reward: 200_00 },
  { key: 'dice3', title: 'Würfle 3-mal', type: 'rounds', game: 'dice', target: 3, reward: 200_00 },
  { key: 'wins3', title: 'Gewinne 3 Runden', type: 'wins', target: 3, reward: 300_00 },
  { key: 'coin2', title: 'Gewinne 2-mal beim Münzwurf', type: 'wins', game: 'coinflip', target: 2, reward: 200_00 },
  { key: 'games3', title: 'Spiele an 3 verschiedenen Tischen', type: 'distinct', target: 3, reward: 350_00 },
  { key: 'wager1000', title: 'Setze heute insgesamt 🪙 1.000', type: 'wager', target: 1000_00, reward: 250_00 },
  { key: 'bigwin', title: 'Gewinne eine Runde mit mindestens 3× Einsatz', type: 'bigwin', mult: 3, target: 1, reward: 400_00 },
  { key: 'crash2', title: 'Zahle bei Crash mit mindestens 2× aus', type: 'crash', mult: 2, target: 1, reward: 300_00 },
  { key: 'mines3', title: 'Decke bei Mines 3 Felder auf und zahle aus', type: 'mines', target: 1, reward: 300_00 },
  { key: 'chat', title: 'Schreibe eine Nachricht im Chat', type: 'chat', target: 1, reward: 100_00 },
  { key: 'pick3', title: 'Sammle 3 Chips in der Halle ein', type: 'pickup', target: 3, reward: 150_00 },
  { key: 'keno2', title: 'Spiele 2 Runden Keno', type: 'rounds', game: 'keno', target: 2, reward: 200_00 },
  { key: 'scratch3', title: 'Rubbele 3 Lose frei', type: 'rounds', game: 'scratch', target: 3, reward: 200_00 },
  { key: 'derby1', title: 'Gewinne ein Derby-Rennen', type: 'wins', game: 'derby', target: 1, reward: 300_00 },
  { key: 'poker2', title: 'Spiele 2 Runden 3-Card Poker', type: 'rounds', game: 'poker3', target: 2, reward: 250_00 },
];

export const ACHIEVEMENTS = [
  { key: 'first_round', title: 'Erste Runde', desc: 'Spiele deine erste Runde', reward: 100_00 },
  { key: 'rounds_25', title: 'Stammgast', desc: '25 Runden gespielt', reward: 300_00 },
  { key: 'rounds_100', title: 'Dauergast', desc: '100 Runden gespielt', reward: 1000_00 },
  { key: 'rounds_500', title: 'Inventar', desc: '500 Runden gespielt', reward: 2500_00 },
  { key: 'win_10x', title: 'Glückspilz', desc: 'Eine Runde mit mindestens 10× Einsatz gewonnen', reward: 500_00 },
  { key: 'win_50x', title: 'Jackpot!', desc: 'Eine Runde mit mindestens 50× Einsatz gewonnen', reward: 1500_00 },
  { key: 'all_games', title: 'Weltenbummler', desc: `Alle ${GAME_IDS.length} Spiele gespielt`, reward: 1000_00 },
  { key: 'streak_5', title: 'Heiße Hand', desc: '5 Siege in Folge', reward: 400_00 },
  { key: 'balance_20k', title: 'High Roller', desc: 'Guthaben von 🪙 20.000 erreicht', reward: 500_00 },
  { key: 'balance_100k', title: 'Whale', desc: 'Guthaben von 🪙 100.000 erreicht', reward: 2500_00 },
  { key: 'chatter', title: 'Gesellig', desc: 'Erste Chat-Nachricht geschrieben', reward: 50_00 },
  { key: 'collector', title: 'Sammler', desc: '20 Chips in der Halle eingesammelt', reward: 300_00 },
  { key: 'streak_7', title: 'Treue Seele', desc: '7 Tage in Folge den Tagesbonus abgeholt', reward: 1000_00 },
];

export const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
export const dailyAmount = (streak) => Math.min(DAILY_MAX, DAILY_BASE + DAILY_STEP * Math.max(0, streak - 1));

/** Drei Tagesaufgaben je Nutzer und Tag – deterministisch aus Nutzer-ID + Datum */
export function missionsFor(userId, day = today()) {
  let seed = userId * 7919 + [...day].reduce((s, c) => s * 31 + c.charCodeAt(0), 7);
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pool = [...MISSION_POOL];
  const picked = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return picked;
}

const getProgress = db.prepare('SELECT progress, claimed FROM missions WHERE user_id = ? AND day = ? AND key = ?');
const upsertProgress = db.prepare(`
  INSERT INTO missions (user_id, day, key, progress, claimed) VALUES (?, ?, ?, ?, 0)
  ON CONFLICT(user_id, day, key) DO UPDATE SET progress = excluded.progress
`);

/** Fortschritt einer Aufgabe erhöhen (innerhalb einer Transaktion). Liefert true, wenn sie gerade fertig wurde. */
function bump(userId, day, m, amount = 1, absolute = null) {
  const row = getProgress.get(userId, day, m.key);
  const before = row?.progress ?? 0;
  if (row?.claimed || before >= m.target) return false;
  const after = Math.min(m.target, absolute ?? before + amount);
  if (after === before) return false;
  upsertProgress.run(userId, day, m.key, after);
  return after >= m.target;
}

function notify(userId, msg) { bus.emit('notify', { userId, msg }); }

function unlock(userId, key) {
  const a = ACHIEVEMENTS.find((x) => x.key === key);
  if (!a) return;
  const exists = db.prepare('SELECT 1 FROM achievements WHERE user_id = ? AND key = ?').get(userId, key);
  if (exists) return;
  db.prepare('INSERT INTO achievements (user_id, key, created_at) VALUES (?, ?, ?)').run(userId, key, Date.now());
  const balance = credit(userId, a.reward, 'achievement', { label: `Erfolg: ${a.title}`, key });
  notify(userId, { t: 'reward', kind: 'achievement', title: a.title, desc: a.desc, amount: a.reward, balance });
}

function distinctGames(userId, day = null) {
  const rows = day
    ? db.prepare("SELECT DISTINCT game FROM transactions WHERE user_id = ? AND type = 'round' AND created_at >= ?").all(userId, Date.parse(day))
    : db.prepare("SELECT DISTINCT game FROM transactions WHERE user_id = ? AND type = 'round'").all(userId);
  return rows.map((r) => r.game).filter((g) => GAME_IDS.includes(g));
}

// ---------- Ereignisse aus dem Spiel ----------
bus.on('round', (r) => {
  try {
    transaction(() => {
      const u = getUser(r.userId);
      if (!u) return;
      const day = today();
      const won = r.payout > r.bet;
      const mult = r.bet > 0 ? r.payout / r.bet : 0;
      const winStreak = won ? u.win_streak + 1 : 0;
      db.prepare('UPDATE users SET win_streak = ? WHERE id = ?').run(winStreak, u.id);

      for (const m of missionsFor(u.id, day)) {
        let done = false;
        if (m.type === 'rounds' && (!m.game || m.game === r.game)) done = bump(u.id, day, m);
        else if (m.type === 'wins' && won && (!m.game || m.game === r.game)) done = bump(u.id, day, m);
        else if (m.type === 'wager') done = bump(u.id, day, m, r.bet);
        else if (m.type === 'bigwin' && mult >= m.mult) done = bump(u.id, day, m);
        else if (m.type === 'crash' && r.game === 'crash' && r.meta?.result === 'cashed' && mult >= m.mult) done = bump(u.id, day, m);
        else if (m.type === 'mines' && r.game === 'mines' && r.meta?.result === 'cashout' && (r.meta?.revealed ?? 3) >= 3) done = bump(u.id, day, m);
        else if (m.type === 'distinct') done = bump(u.id, day, m, 0, distinctGames(u.id, day).length);
        if (done) notify(u.id, { t: 'reward', kind: 'mission_done', title: m.title, amount: m.reward });
      }

      const rounds = u.games_played; // bereits inkl. dieser Runde
      if (rounds >= 1) unlock(u.id, 'first_round');
      if (rounds >= 25) unlock(u.id, 'rounds_25');
      if (rounds >= 100) unlock(u.id, 'rounds_100');
      if (rounds >= 500) unlock(u.id, 'rounds_500');
      if (mult >= 10) unlock(u.id, 'win_10x');
      if (mult >= 50) unlock(u.id, 'win_50x');
      if (winStreak >= 5) unlock(u.id, 'streak_5');
      if (r.balance >= 20000_00) unlock(u.id, 'balance_20k');
      if (r.balance >= 100000_00) unlock(u.id, 'balance_100k');
      if (distinctGames(u.id).length >= GAME_IDS.length) unlock(u.id, 'all_games');
    });
  } catch (e) { console.error('rewards/round', e); }
});

bus.on('daily-streak', ({ userId, streak }) => {
  try { transaction(() => { if (streak >= 7) unlock(userId, 'streak_7'); }); } catch (e) { console.error('rewards/streak', e); }
});

bus.on('chat', ({ userId }) => {
  try {
    transaction(() => {
      const day = today();
      for (const m of missionsFor(userId, day)) if (m.type === 'chat' && bump(userId, day, m)) notify(userId, { t: 'reward', kind: 'mission_done', title: m.title, amount: m.reward });
      unlock(userId, 'chatter');
    });
  } catch (e) { console.error('rewards/chat', e); }
});

/** Chip in der Halle eingesammelt (vom Realtime-Server aufgerufen). Liefert neuen Kontostand oder null (Tageslimit). */
export function pickup(userId, value) {
  return transaction(() => {
    const u = getUser(userId);
    if (!u) return null;
    const day = today();
    const soFar = u.pickup_day === day ? u.pickup_today : 0;
    if (soFar >= PICKUP_CAP) return null;
    const amount = Math.min(value, PICKUP_CAP - soFar);
    db.prepare('UPDATE users SET pickup_day = ?, pickup_today = ?, pickups_total = pickups_total + 1 WHERE id = ?').run(day, soFar + amount, u.id);
    const balance = credit(u.id, amount, 'pickup', { label: 'Chip gefunden' });
    for (const m of missionsFor(u.id, day)) if (m.type === 'pickup' && bump(u.id, day, m)) notify(u.id, { t: 'reward', kind: 'mission_done', title: m.title, amount: m.reward });
    if (u.pickups_total + 1 >= 20) unlock(u.id, 'collector');
    return { balance, amount, today: soFar + amount };
  });
}

// ---------- Übersicht & API ----------
export function summary(userId) {
  const u = getUser(userId);
  const day = today();
  const continues = u.last_daily_day === yesterday() || u.last_daily_day === day;
  const daily = { available: u.last_daily_day !== day, streak: u.streak, nextAmount: dailyAmount(continues ? u.streak + 1 : 1), claimedToday: u.last_daily_day === day };
  const missions = missionsFor(userId, day).map((m) => {
    const row = getProgress.get(userId, day, m.key);
    return { key: m.key, title: m.title, target: m.target, reward: m.reward, progress: row?.progress ?? 0, claimed: !!row?.claimed, done: (row?.progress ?? 0) >= m.target };
  });
  const unlocked = new Set(db.prepare('SELECT key FROM achievements WHERE user_id = ?').all(userId).map((r) => r.key));
  const achievements = ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlocked.has(a.key) }));
  const pickups = { today: u.pickup_day === day ? u.pickup_today : 0, cap: PICKUP_CAP, total: u.pickups_total };
  const claimable = (daily.available ? 1 : 0) + missions.filter((m) => m.done && !m.claimed).length;
  return { daily, missions, achievements, pickups, claimable };
}

export const rewardsRouter = Router();
rewardsRouter.use(requireAuth);

rewardsRouter.get('/', (req, res) => res.json(summary(req.user.id)));

rewardsRouter.post('/daily', (req, res) => {
  const out = transaction(() => {
    const u = getUser(req.user.id);
    const day = today();
    if (u.last_daily_day === day) throw new HttpError(400, 'Tagesbonus heute schon abgeholt');
    const streak = u.last_daily_day === yesterday() ? u.streak + 1 : 1;
    const amount = dailyAmount(streak);
    db.prepare('UPDATE users SET streak = ?, last_daily_day = ?, last_bonus_at = ? WHERE id = ?').run(streak, day, Date.now(), u.id);
    const balance = credit(u.id, amount, 'bonus', { label: `Tagesbonus (Tag ${streak})`, streak });
    if (streak >= 7) unlock(u.id, 'streak_7');
    return { amount, streak, balance };
  });
  res.json({ ...out, user: publicUser(getUser(req.user.id)), summary: summary(req.user.id) });
});

rewardsRouter.post('/missions/:key/claim', (req, res) => {
  const out = transaction(() => {
    const day = today();
    const m = missionsFor(req.user.id, day).find((x) => x.key === req.params.key);
    if (!m) throw new HttpError(400, 'Aufgabe nicht gefunden');
    const row = getProgress.get(req.user.id, day, m.key);
    if (!row || row.progress < m.target) throw new HttpError(400, 'Aufgabe noch nicht erfüllt');
    if (row.claimed) throw new HttpError(400, 'Belohnung bereits abgeholt');
    db.prepare('UPDATE missions SET claimed = 1 WHERE user_id = ? AND day = ? AND key = ?').run(req.user.id, day, m.key);
    const balance = credit(req.user.id, m.reward, 'mission', { label: `Aufgabe: ${m.title}` });
    return { amount: m.reward, balance };
  });
  res.json({ ...out, user: publicUser(getUser(req.user.id)), summary: summary(req.user.id) });
});
