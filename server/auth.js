import { Router } from 'express';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db, transaction } from './db.js';
import { HttpError, bad, parseCookies } from './util.js';
import { START_BALANCE, publicUser } from './wallet.js';
import { bus, live } from './events.js';

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

const clientIp = (req) => (req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress ?? '').trim().replace(/^::ffff:/, '');
/** Kurze, nicht zurückrechenbare Kennung einer Session (für die Sitzungsliste) */
export const sessionId = (token) => createHash('sha256').update(token).digest('hex').slice(0, 12);

function createSession(userId, req) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at, user_agent, ip, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(token, userId, now, now + SESSION_TTL, String(req.headers['user-agent'] ?? '').slice(0, 300), clientIp(req), now);
  return token;
}

/** Grobe Gerätebeschreibung aus dem User-Agent */
export function describeAgent(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

const selectUserBySession = db.prepare(`
  SELECT u.*, s.last_seen_at AS session_seen FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?
`);
const touchSession = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?');

/** Hängt req.user an, wenn ein gültiges Session-Cookie vorliegt. */
export function attachUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = null;
  if (token) {
    const now = Date.now();
    const row = selectUserBySession.get(token, now);
    if (row) {
      req.user = row;
      req.sessionToken = token;
      if (!row.session_seen || now - row.session_seen > 60_000) touchSession.run(now, token);
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

  setSessionCookie(res, createSession(user.id, req));
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') throw bad('Ungültige Eingabe');
  const user = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(username.toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Benutzername oder Passwort falsch');
  }
  setSessionCookie(res, createSession(user.id, req));
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

// ---------- Sitzungsverwaltung ----------
authRouter.get('/sessions', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT token, created_at, expires_at, user_agent, ip, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC')
    .all(req.user.id, Date.now());
  res.json({
    sessions: rows.map((s) => ({
      id: sessionId(s.token),
      device: describeAgent(s.user_agent ?? ''),
      ip: s.ip ?? '',
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at ?? s.created_at,
      current: s.token === req.sessionToken,
      live: live.tokens.has(s.token),
    })),
  });
});

function revokeSessions(userId, tokens) {
  for (const token of tokens) {
    db.prepare('DELETE FROM sessions WHERE token = ? AND user_id = ?').run(token, userId);
    bus.emit('session-revoked', { token });
  }
}

/** Alle anderen Sitzungen beenden */
authRouter.delete('/sessions', requireAuth, (req, res) => {
  const tokens = db.prepare('SELECT token FROM sessions WHERE user_id = ? AND token != ?').all(req.user.id, req.sessionToken).map((r) => r.token);
  revokeSessions(req.user.id, tokens);
  res.json({ ok: true, ended: tokens.length });
});

/** Eine Sitzung beenden (auch die eigene) */
authRouter.delete('/sessions/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT token FROM sessions WHERE user_id = ?').all(req.user.id).find((r) => sessionId(r.token) === req.params.id);
  if (!row) throw new HttpError(404, 'Sitzung nicht gefunden');
  revokeSessions(req.user.id, [row.token]);
  if (row.token === req.sessionToken) res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true, self: row.token === req.sessionToken });
});
