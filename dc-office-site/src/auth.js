import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { config, SESSION_COOKIE, OAUTH_STATE_COOKIE } from './config.js';

const SESSION_TTL = '30d';

function oauthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    `${config.baseUrl}/auth/google/callback`
  );
}

export function buildAuthUrl(res, returnTo) {
  // The state parameter is the CSRF defence for the callback: we mint a random
  // value, stash it in a short-lived cookie, and refuse any callback whose
  // state doesn't match the cookie we set.
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(
    OAUTH_STATE_COOKIE,
    jwt.sign({ state, returnTo: returnTo || '/' }, config.sessionSecret, { expiresIn: '10m' }),
    { httpOnly: true, secure: config.isProduction, sameSite: 'lax', maxAge: 10 * 60 * 1000 }
  );

  return oauthClient().generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    // A hint, not a control: it preselects the right account in the picker.
    // The real restriction is the verified `hd` check below.
    hd: config.allowedDomain,
    prompt: 'select_account',
  });
}

export async function completeSignIn(req, res) {
  const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE];
  if (!stateCookie) throw new AuthError('Your sign-in link expired. Please try again.');

  let statePayload;
  try {
    statePayload = jwt.verify(stateCookie, config.sessionSecret);
  } catch {
    throw new AuthError('Your sign-in link expired. Please try again.');
  }
  res.clearCookie(OAUTH_STATE_COOKIE);

  if (!req.query.state || req.query.state !== statePayload.state) {
    throw new AuthError('Sign-in could not be verified. Please try again.');
  }
  if (!req.query.code) throw new AuthError('Google did not return an authorization code.');

  const client = oauthClient();
  const { tokens } = await client.getToken(String(req.query.code));
  if (!tokens.id_token) throw new AuthError('Google did not return an identity token.');

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();

  // Three separate gates. `hd` is the Workspace domain claim and the one that
  // actually matters — an email address ending in the right domain can be
  // spoofed by a personal account with a display name, `hd` cannot.
  if (!payload?.email || payload.email_verified !== true) {
    throw new AuthError('Google did not confirm a verified email address for that account.');
  }
  if ((payload.hd || '').toLowerCase() !== config.allowedDomain) {
    throw new AuthError(
      `This site is limited to ${config.allowedDomain} accounts. You signed in as ${payload.email}.`
    );
  }
  if (!payload.email.toLowerCase().endsWith(`@${config.allowedDomain}`)) {
    throw new AuthError(`This site is limited to ${config.allowedDomain} accounts.`);
  }

  const user = {
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || null,
  };

  res.cookie(SESSION_COOKIE, jwt.sign(user, config.sessionSecret, { expiresIn: SESSION_TTL }), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return statePayload.returnTo || '/';
}

export function currentUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { email, name, picture } = jwt.verify(token, config.sessionSecret);
    return { email, name, picture };
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not signed in.' });
    }
    return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  }
  req.user = user;
  next();
}

/**
 * Reject cross-site state changes. The session cookie is SameSite=Lax, which
 * already blocks cross-site form POSTs, but the board mutates through fetch()
 * so an explicit same-origin check costs nothing and closes the gap.
 */
export function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin.replace(/\/+$/, '') !== config.baseUrl) {
    return res.status(403).json({ error: 'Cross-origin request rejected.' });
  }
  next();
}

export class AuthError extends Error {}
