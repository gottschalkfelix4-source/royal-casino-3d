import { randomUUID } from 'node:crypto';
import { db, transaction } from '../db.js';
import { HttpError, toCents } from '../util.js';
import { debit, settleRound } from '../wallet.js';

export const MIN_BET = 1_00;
export const MAX_BET = 1_000_000_00;

export const parseBet = (value) => toCents(value, { min: MIN_BET, max: MAX_BET });

/**
 * Einmalige Runde (Einsatz -> Ergebnis -> Auszahlung) in einer Transaktion.
 * compute() liefert { payout, ...öffentliche Ergebnisdaten }.
 */
export function playOneShot(userId, game, bet, compute) {
  return transaction(() => {
    debit(userId, bet);
    const result = compute();
    const payout = Math.max(0, Math.floor(result.payout ?? 0));
    const { payout: _p, meta, ...pub } = result;
    const balance = settleRound(userId, game, bet, payout, meta ?? {});
    return { ...pub, bet, payout, balance };
  });
}

// ---------- Mehrstufige Spiele (Zustand in DB) ----------

const selectActive = db.prepare(
  "SELECT * FROM games WHERE user_id = ? AND type = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
);

export function getActiveGame(userId, type) {
  const row = selectActive.get(userId, type);
  return row ? { ...row, state: JSON.parse(row.state) } : null;
}

export function requireActiveGame(userId, type) {
  const g = getActiveGame(userId, type);
  if (!g) throw new HttpError(400, 'Kein laufendes Spiel');
  return g;
}

/** Startet ein neues Spiel: zieht den Einsatz ab und speichert den Zustand. */
export function startGame(userId, type, bet, state) {
  return transaction(() => {
    if (getActiveGame(userId, type)) throw new HttpError(400, 'Es läuft bereits ein Spiel');
    const balance = debit(userId, bet);
    const id = randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO games (id, user_id, type, bet, state, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, userId, type, bet, JSON.stringify(state), now, now);
    return { id, user_id: userId, type, bet, state, status: 'active', balance };
  });
}

export function saveGame(game) {
  db.prepare('UPDATE games SET state = ?, bet = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(game.state), game.bet, Date.now(), game.id);
}

/** Beendet ein Spiel und bucht die Auszahlung. Innerhalb einer Transaktion aufrufen. */
export function finishGame(game, payout, meta = {}) {
  payout = Math.max(0, Math.floor(payout));
  db.prepare("UPDATE games SET state = ?, status = 'finished', updated_at = ? WHERE id = ?")
    .run(JSON.stringify(game.state), Date.now(), game.id);
  return settleRound(game.user_id, game.type, game.bet, payout, meta);
}

export { transaction, debit };
