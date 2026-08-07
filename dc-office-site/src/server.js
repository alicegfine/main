import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { config, SESSION_COOKIE } from './config.js';
import { initSchema, pool, withDayLock } from './db.js';
import { AuthError, buildAuthUrl, completeSignIn, currentUser, requireAuth, requireSameOrigin } from './auth.js';
import { BoardError, getBoard, setAttendance } from './board.js';
import { resyncCoveredDays, subscribeUrl } from './calendarSync.js';
import { faqSections, hasPlaceholders } from './faq.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Railway terminates TLS at its edge, so without this Express sees http and
// refuses to set Secure cookies.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(here, '..', 'views'));

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use('/static', express.static(path.join(here, '..', 'public'), { maxAge: '1h' }));

app.locals.officeName = config.officeName;

// --- health -----------------------------------------------------------------

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

// --- auth -------------------------------------------------------------------

app.get('/login', (req, res) => {
  if (currentUser(req)) return res.redirect('/');
  res.render('login', {
    user: null,
    allowedDomain: config.allowedDomain,
    returnTo: typeof req.query.returnTo === 'string' ? req.query.returnTo : '/',
    error: typeof req.query.error === 'string' ? req.query.error : null,
  });
});

app.get('/auth/google', (req, res) => {
  const returnTo = typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/')
    ? req.query.returnTo
    : '/';
  res.redirect(buildAuthUrl(res, returnTo));
});

app.get('/auth/google/callback', async (req, res, next) => {
  try {
    res.redirect(await completeSignIn(req, res));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    next(error);
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/login');
});

// --- pages ------------------------------------------------------------------

app.get('/', requireAuth, async (req, res, next) => {
  try {
    const board = await getBoard(req.user);
    res.render('board', {
      user: req.user,
      board,
      subscribeUrl: subscribeUrl(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/faq', requireAuth, (req, res) => {
  res.render('faq', {
    user: req.user,
    sections: faqSections,
    showPlaceholderNotice: hasPlaceholders(),
  });
});

// --- api --------------------------------------------------------------------

app.get('/api/board', requireAuth, async (req, res, next) => {
  try {
    res.json(await getBoard(req.user));
  } catch (error) {
    next(error);
  }
});

app.post('/api/rsvp', requireAuth, requireSameOrigin, async (req, res, next) => {
  try {
    const { day, going } = req.body || {};
    if (typeof going !== 'boolean') {
      return res.status(400).json({ error: '`going` must be true or false.' });
    }
    res.json(await setAttendance(req.user, String(day), going));
  } catch (error) {
    if (error instanceof BoardError) return res.status(400).json({ error: error.message });
    next(error);
  }
});

// Idempotent repair for the calendar mirror. Worth pointing a Railway cron at
// (e.g. nightly) so hand-edits to the shared calendar get corrected and any day
// that failed to sync during an outage is brought back in line.
app.post('/api/resync', requireAuth, requireSameOrigin, async (req, res, next) => {
  try {
    res.json(await resyncCoveredDays(withDayLock));
  } catch (error) {
    next(error);
  }
});

// --- errors -----------------------------------------------------------------

app.use((req, res) => {
  res.status(404).render('error', {
    user: currentUser(req),
    title: 'Not found',
    message: 'That page does not exist.',
  });
});

app.use((error, req, res, _next) => {
  console.error('[server]', error);
  res.status(500).render('error', {
    user: currentUser(req),
    title: 'Something broke',
    message: config.isProduction
      ? 'Something went wrong on our end. Try again in a moment.'
      : String(error?.stack || error),
  });
});

// --- boot -------------------------------------------------------------------

async function start() {
  await initSchema();
  app.listen(config.port, () => {
    console.log(`[server] ${config.officeName} site listening on :${config.port}`);
    console.log(`[server] domain restricted to ${config.allowedDomain}`);
  });
}

start().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
