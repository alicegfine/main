// Everyone using the site says who they are before they can change anything.
//
// This is just a name in a cookie, not an account and not a password. It exists
// so that signing up is one click instead of retyping your name each time, and so
// that the site knows which entries on the schedule are yours. It is separate
// from Alice's sign-in, which is what unlocks editing the spiel.

import { MAX_NAME_LENGTH } from './retreat.js';
import { parseCookies } from './cookies.js';

const COOKIE_NAME = 'retreat_visitor';
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export function cleanName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function setVisitorName(res, name) {
  res.cookie(COOKIE_NAME, name, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

export function clearVisitorName(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Sets req.visitorName to the visitor's name, or null if they haven't given one.
export function visitorMiddleware(req, res, next) {
  const raw = parseCookies(req.headers.cookie)[COOKIE_NAME];
  req.visitorName = raw ? cleanName(raw) || null : null;
  return next();
}

// Anything that writes to the schedule needs a name attached to it.
export function requireVisitor(req, res, next) {
  if (req.visitorName) return next();
  const back = req.body?.return_to === 'spiel' ? '/the-spiel' : '/';
  return res.redirect(`${back}?error=name-required`);
}

export function isSamePerson(a, b) {
  return Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase();
}
