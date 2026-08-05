// Sign-in for Alice, which unlocks editing the spiel.
//
// This is a single shared password checked against ADMIN_PASSWORD, held in a
// signed cookie. It is the only locked part of the site: the schedule is open to
// everyone. It is not meant to protect anything sensitive, so don't put anything
// sensitive behind it.

import crypto from 'node:crypto';
import { parseCookies } from './cookies.js';
import { getSetting, putSetting } from './db.js';

const COOKIE_NAME = 'retreat_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const ADMIN_USERNAME = 'Alice';

const password = process.env.ADMIN_PASSWORD || '';

// Without a stable secret, every restart invalidates the signed-in session — and
// a restart in the middle of editing the spiel would reject the save. So when no
// SESSION_SECRET is configured, generate one once and keep it in the database
// rather than in memory.
let secret = process.env.SESSION_SECRET || '';
if (!secret) {
  secret = getSetting('session_secret') || '';
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    putSetting('session_secret', secret);
    console.log(
      'SESSION_SECRET is not set; generated one and stored it in the database so sign-ins survive restarts.',
    );
  }
}
if (!password) {
  console.warn(
    'ADMIN_PASSWORD is not set, so sign-in is disabled and the site is read-only.',
  );
}

export const signInEnabled = Boolean(password);

function sign(payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function checkCredentials(username, submittedPassword) {
  if (!password) return false;
  if (typeof username !== 'string' || typeof submittedPassword !== 'string') {
    return false;
  }
  if (username.trim().toLowerCase() !== ADMIN_USERNAME.toLowerCase()) return false;
  return safeEqual(submittedPassword, password);
}

export function issueSession(res) {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = Buffer.from(JSON.stringify({ user: ADMIN_USERNAME, expiresAt })).toString(
    'base64url',
  );
  const value = `${payload}.${sign(payload)}`;

  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Sets req.isAdmin based on the session cookie.
export function sessionMiddleware(req, res, next) {
  req.isAdmin = false;

  const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!raw) return next();

  const separator = raw.lastIndexOf('.');
  if (separator === -1) return next();

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return next();

  try {
    const { user, expiresAt } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (user === ADMIN_USERNAME && typeof expiresAt === 'number' && expiresAt > Date.now()) {
      req.isAdmin = true;
    }
  } catch {
    // A malformed payload just means "not signed in".
  }

  return next();
}

export function requireAdmin(req, res, next) {
  if (req.isAdmin) return next();
  return res.redirect('/signin');
}
