import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import {
  DAYS,
  MAX_PAGE_LENGTH,
  MAX_TITLE_LENGTH,
  ROLES,
  formatRange,
  parseTime,
  todayInEastern,
  validateBlock,
} from './retreat.js';
import {
  createBlock,
  createSignup,
  deleteBlock,
  deleteSignup,
  getBlock,
  getBlocksForDay,
  getLeader,
  getLinks,
  getPage,
  getScheduleByDay,
  getSignup,
  saveLinks,
  savePage,
  updateBlockTimes,
} from './db.js';
import {
  checkCredentials,
  clearSession,
  issueSession,
  sessionMiddleware,
  signInEnabled,
} from './auth.js';
import {
  cleanName,
  clearVisitorName,
  isSamePerson,
  requireVisitor,
  setVisitorName,
  visitorMiddleware,
} from './visitor.js';
import { buildIcs } from './calendar.js';
import { errorPage, infoPage, notFoundPage, schedulePage, signInPage } from './views.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
// Comfortably above MAX_PAGE_LENGTH even once the text is URL-encoded, so a long
// info page is truncated by an explicit rule rather than rejected by the parser.
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(sessionMiddleware);
app.use(visitorMiddleware);
app.use(express.static(path.join(here, '..', 'public'), { maxAge: '1h' }));

// Messages are passed through the redirect so that every POST ends in a
// redirect and nothing is resubmitted on refresh.
const MESSAGES = {
  'signed-up': 'You are signed up.',
  removed: 'Name removed.',
  'block-added': 'Session added.',
  'block-deleted': 'Session deleted, along with its signups.',
  'times-changed': 'Session times updated.',
  'not-leader': 'Only the person leading a session can change its times.',
  saved: 'Page saved.',
  'links-saved': 'Links updated.',
  'saved-after-signin': 'Signed in, and the text you had written is saved.',
  'session-lapsed':
    'You had been signed out, so that save did not go through. Your text is safe — enter the password and it will be saved.',
  'signed-out': 'Signed out.',
  'name-set': 'Thanks — you can sign up for sessions now.',
  locked: 'Editing locked again.',
  'bad-password': 'That name and password did not match.',
  'name-required': 'Put in your name first.',
  'bad-role': 'Choose whether you are attending or leading.',
  'unknown-block': 'That session no longer exists.',
  'not-yours': 'You can only take your own name off a session.',
};

function messagesFrom(req) {
  return {
    notice: MESSAGES[req.query.ok] ?? null,
    error: MESSAGES[req.query.error] ?? req.query.reason ?? null,
  };
}

app.get('/', (req, res) => {
  const { notice, error } = messagesFrom(req);
  res.send(
    schedulePage({
      schedule: getScheduleByDay(DAYS),
      links: getLinks(),
      siteUrl: siteUrlFor(req),
      today: todayInEastern(),
      isAdmin: req.isAdmin,
      visitorName: req.visitorName,
      notice,
      error,
    }),
  );
});

/* Who you are ------------------------------------------------------------- */

app.post('/visitor', (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.redirect('/?error=name-required');
  setVisitorName(res, name);
  return res.redirect('/?ok=name-set');
});

// One "Sign out" in the header, so it clears both the name and, if Alice is
// signed in, her editing session — leaving one behind is confusing.
app.post('/signout', (req, res) => {
  clearVisitorName(res);
  clearSession(res);
  res.redirect('/?ok=signed-out');
});

/* Sessions — open to anyone who has given a name ------------------------- */

app.post('/blocks', requireVisitor, (req, res) => {
  const day = String(req.body.day ?? '');
  const startMin = parseTime(req.body.start);
  const endMin = parseTime(req.body.end);
  const title = String(req.body.title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);

  const problem = validateBlock({ day, startMin, endMin }, getBlocksForDay(day));
  if (problem) {
    return res.redirect(`/?reason=${encodeURIComponent(problem)}`);
  }

  createBlock({ day, startMin, endMin, title });
  return res.redirect('/?ok=block-added');
});

// Whoever is leading a session can move it. The day stays put; only the times
// change, so the overlap check runs against that day's other sessions.
app.post('/blocks/:id', requireVisitor, (req, res) => {
  const block = getBlock(Number(req.params.id));
  if (!block) return res.redirect('/?error=unknown-block');

  const leader = getLeader(block.id);
  const youLead = leader && isSamePerson(leader.name, req.visitorName);
  if (!youLead && !req.isAdmin) return res.redirect('/?error=not-leader');

  const startMin = parseTime(req.body.start);
  const endMin = parseTime(req.body.end);
  const others = getBlocksForDay(block.day).filter((other) => other.id !== block.id);

  const problem = validateBlock({ day: block.day, startMin, endMin }, others);
  if (problem) return res.redirect(`/?reason=${encodeURIComponent(problem)}`);

  updateBlockTimes({ id: block.id, startMin, endMin });
  return res.redirect('/?ok=times-changed');
});

app.post('/blocks/:id/delete', requireVisitor, (req, res) => {
  deleteBlock(Number(req.params.id));
  res.redirect('/?ok=block-deleted');
});

app.post('/signups', requireVisitor, (req, res) => {
  const blockId = Number(req.body.block_id);
  const role = String(req.body.role ?? '');

  if (!Number.isInteger(blockId) || !getBlock(blockId)) {
    return res.redirect('/?error=unknown-block');
  }
  if (!ROLES.includes(role)) return res.redirect('/?error=bad-role');

  const result = createSignup({ blockId, name: req.visitorName, role });
  if (!result.ok) {
    return res.redirect(`/?reason=${encodeURIComponent(result.error)}`);
  }
  return res.redirect('/?ok=signed-up');
});

// You can take your own name off a session. Alice can take anyone's off.
app.post('/signups/:id/delete', requireVisitor, (req, res) => {
  const signup = getSignup(Number(req.params.id));
  if (!signup) return res.redirect('/?ok=removed');
  if (!req.isAdmin && !isSamePerson(signup.name, req.visitorName)) {
    return res.redirect('/?error=not-yours');
  }
  deleteSignup(signup.id);
  return res.redirect('/?ok=removed');
});

/* Calendar export --------------------------------------------------------- */

function siteUrlFor(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// Serves the whole schedule, or with ?mine=1 only the sessions your name is on.
// The same URL works as a one-off download and as a subscribed feed.
app.get('/schedule.ics', (req, res) => {
  const onlyMine = req.query.mine === '1' && Boolean(req.visitorName);

  const body = buildIcs({
    schedule: getScheduleByDay(DAYS),
    siteUrl: siteUrlFor(req),
    joinUrl: getLinks().sit,
    stamp: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
    include: onlyMine
      ? (block) =>
          [...block.leading, ...block.attending].some((signup) =>
            isSamePerson(signup.name, req.visitorName),
          )
      : undefined,
  });

  res.type('text/calendar; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${onlyMine ? 'my-retreat-sessions' : 'jhana-noting-retreat'}.ics"`,
  );
  // A subscribed client re-reads this URL, so it must not be served from cache.
  res.setHeader('Cache-Control', 'no-cache');
  res.send(body);
});

/* The two buttons at the top of the schedule ----------------------------- */

// Only http(s) is accepted: these end up in an href, and a javascript: or data:
// URL there would run when someone clicked the button.
function cleanUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

app.post('/links', (req, res) => {
  if (!req.isAdmin) return res.redirect('/signin');

  const sit = cleanUrl(req.body.sit);
  const signal = cleanUrl(req.body.signal);

  if (sit === null || signal === null) {
    return res.redirect(
      `/?reason=${encodeURIComponent('Links need to start with http:// or https://')}`,
    );
  }

  saveLinks({ sit, signal });
  return res.redirect('/?ok=links-saved');
});

/* The info page — the one part only Alice can change --------------------- */

app.get('/info', (req, res) => {
  const { notice, error } = messagesFrom(req);
  res.send(
    infoPage({
      page: getPage('info'),
      isAdmin: req.isAdmin,
      visitorName: req.visitorName,
      editing: req.isAdmin && req.query.edit === '1',
      notice,
      error,
    }),
  );
});

// Deliberately not behind requireAdmin: if the editing session has lapsed —
// which a restart or a redeploy can do while the page sits open — redirecting to
// the password form would throw away everything typed. Instead the text is
// carried into that form and saved as soon as the password is accepted.
app.post('/info', (req, res) => {
  const body = String(req.body.body ?? '').slice(0, MAX_PAGE_LENGTH);

  if (!req.isAdmin) {
    return res.status(200).send(
      signInPage({
        visitorName: req.visitorName,
        resumeBody: body,
        error: MESSAGES['session-lapsed'],
      }),
    );
  }

  if (!body.trim()) {
    return res.redirect(
      `/info?edit=1&reason=${encodeURIComponent('The page cannot be empty.')}`,
    );
  }
  savePage('info', body);
  return res.redirect('/info?ok=saved');
});

// The page has lived at both of these before.
app.get('/how-it-works', (req, res) => res.redirect(301, '/info'));
app.get('/the-spiel', (req, res) => res.redirect(301, '/info'));

/* Alice's sign-in --------------------------------------------------------- */

app.get('/signin', (req, res) => {
  if (req.isAdmin) return res.redirect('/info');
  const { error } = messagesFrom(req);
  return res.send(signInPage({ error, visitorName: req.visitorName }));
});

app.post('/signin', (req, res) => {
  if (!signInEnabled) return res.redirect('/signin');

  // Text carried over from a save that was rejected because the session lapsed.
  const resumeBody = String(req.body.body ?? '').slice(0, MAX_PAGE_LENGTH);

  if (!checkCredentials(req.body.username, req.body.password)) {
    // Re-render rather than redirect, so a wrong password doesn't lose the text.
    return res.status(200).send(
      signInPage({
        visitorName: req.visitorName,
        resumeBody,
        error: MESSAGES['bad-password'],
      }),
    );
  }

  issueSession(res);

  if (resumeBody.trim()) {
    savePage('info', resumeBody);
    return res.redirect('/info?ok=saved-after-signin');
  }
  return res.redirect('/info?edit=1');
});

// Give up editing rights without also forgetting your name.
app.post('/admin/lock', (req, res) => {
  clearSession(res);
  res.redirect('/info?ok=locked');
});

app.use((req, res) => {
  res.status(404).send(notFoundPage({ visitorName: req.visitorName }));
});

// A failed write should say so rather than showing a blank or a stack trace.
app.use((err, req, res, _next) => {
  console.error('Request failed:', err);
  const tooBig = err.type === 'entity.too.large' || err.status === 413;
  res.status(tooBig ? 413 : 500).send(
    errorPage({
      visitorName: req.visitorName,
      message: tooBig
        ? 'That was too much text to send in one go, so nothing was saved. Shorten it and try again.'
        : 'Something went wrong and your change may not have been saved. Go back and check before retyping it.',
    }),
  );
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Retreat site listening on port ${port}`);
  console.log(`Days: ${DAYS.map((day) => day.label).join(', ')}`);
  console.log(`Sessions may run ${formatRange(8 * 60, 24 * 60)}`);
});
