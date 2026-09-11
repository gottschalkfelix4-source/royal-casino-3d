import { Router } from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, transaction } from './db.js';
import { HttpError, bad, parseCookies } from './util.js';
import { START_BALANCE, publicUser } from './wallet.js';

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const COOKIE = 'sid';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`
  );
}

function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, now, now + SESSION_TTL);
  return token;
}

const selectUserBySession = db.prepare(`
  SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?
`);

/** Hängt req.user an, wenn ein gültiges Session-Cookie vorliegt. */
export function attachUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = null;
  if (token) {
    const row = selectUserBySession.get(token, Date.now());
    if (row) {
      req.user = row;
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Bitte zuerst anmelden'));
  next();
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw bad('Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
    throw bad('Passwort muss mindestens 6 Zeichen haben');
  }
}

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const { username, password } = req.body ?? {};
  validateCredentials(username, password);

  const user = transaction(() => {
    const exists = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(username.toLowerCase());
    if (exists) throw new HttpError(409, 'Benutzername ist bereits vergeben');
    const now = Date.now();
    const info = db.prepare(`
      INSERT INTO users (username, username_lower, password_hash, balance, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, username.toLowerCase(), hashPassword(password), START_BALANCE, now);
    const id = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO transactions (user_id, type, amount, balance_after, meta, created_at)
      VALUES (?, 'bonus', ?, ?, ?, ?)
    `).run(id, START_BALANCE, START_BALANCE, JSON.stringify({ label: 'Startguthaben' }), now);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });

  setSessionCookie(res, createSession(user.id));
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') throw bad('Ungültige Eingabe');
  const user = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(username.toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Benutzername oder Passwort falsch');
  }
  setSessionCookie(res, createSession(user.id));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user) });
});
