import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.CASINO_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'casino.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username       TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    balance        INTEGER NOT NULL DEFAULT 0,      -- in Cent
    total_wagered  INTEGER NOT NULL DEFAULT 0,
    total_won      INTEGER NOT NULL DEFAULT 0,
    games_played   INTEGER NOT NULL DEFAULT 0,
    biggest_win    INTEGER NOT NULL DEFAULT 0,
    last_bonus_at  INTEGER,
    last_rescue_at INTEGER,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,                    -- bonus | rescue | round
    game          TEXT,
    amount        INTEGER NOT NULL,                 -- Netto in Cent (+/-)
    bet           INTEGER NOT NULL DEFAULT 0,
    payout        INTEGER NOT NULL DEFAULT 0,
    balance_after INTEGER NOT NULL,
    meta          TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, id DESC);

  CREATE TABLE IF NOT EXISTS games (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    bet        INTEGER NOT NULL,
    state      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',      -- active | finished
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_games_active ON games(user_id, type, status);
`);

/** Führt fn() in einer exklusiven SQLite-Transaktion aus. */
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
