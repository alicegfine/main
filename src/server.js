import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { DAYS, ROLES, formatRange, parseTime, validateBlock } from './retreat.js';
import {
  createBlock,
  createSignup,
  deleteBlock,
  deleteSignup,
  getBlock,
  getBlocksForDay,
  getPage,
  getScheduleByDay,
  getSignup,
  savePage,
} from './db.js';
import {
  checkCredentials,
  clearSession,
  issueSession,
  requireAdmin,
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
import { notFoundPage, schedulePage, signInPage, spielPage } from './views.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
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
  saved: 'Page saved.',
  'signed-out': 'Signed out.',
  'name-set': 'Thanks — you can sign up for sessions now.',
  'name-cleared': 'Name forgotten on this device.',
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

app.post('/visitor/clear', (req, res) => {
  clearVisitorName(res);
  res.redirect('/?ok=name-cleared');
});

/* Sessions — open to anyone who has given a name ------------------------- */

app.post('/blocks', requireVisitor, (req, res) => {
  const day = String(req.body.day ?? '');
  const startMin = parseTime(req.body.start);
  const endMin = parseTime(req.body.end);

  const problem = validateBlock({ day, startMin, endMin }, getBlocksForDay(day));
  if (problem) {
    return res.redirect(`/?reason=${encodeURIComponent(problem)}`);
  }

  createBlock({ day, startMin, endMin });
  return res.redirect('/?ok=block-added');
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

/* The spiel — the one part only Alice can change ------------------------- */

app.get('/the-spiel', (req, res) => {
  const { notice, error } = messagesFrom(req);
  res.send(
    spielPage({
      page: getPage('the-spiel'),
      isAdmin: req.isAdmin,
      visitorName: req.visitorName,
      editing: req.isAdmin && req.query.edit === '1',
      notice,
      error,
    }),
  );
});

app.post('/the-spiel', requireAdmin, (req, res) => {
  const body = String(req.body.body ?? '').slice(0, 50_000);
  if (!body.trim()) {
    return res.redirect(
      `/the-spiel?edit=1&reason=${encodeURIComponent('The page cannot be empty.')}`,
    );
  }
  savePage('the-spiel', body);
  return res.redirect('/the-spiel?ok=saved');
});

// The page used to live here.
app.get('/how-it-works', (req, res) => res.redirect(301, '/the-spiel'));

/* Alice's sign-in --------------------------------------------------------- */

app.get('/signin', (req, res) => {
  if (req.isAdmin) return res.redirect('/the-spiel');
  const { error } = messagesFrom(req);
  return res.send(signInPage({ error, visitorName: req.visitorName }));
});

app.post('/signin', (req, res) => {
  if (!signInEnabled) return res.redirect('/signin');
  if (!checkCredentials(req.body.username, req.body.password)) {
    return res.redirect('/signin?error=bad-password');
  }
  issueSession(res);
  return res.redirect('/the-spiel');
});

app.post('/signout', (req, res) => {
  clearSession(res);
  res.redirect('/?ok=signed-out');
});

app.use((req, res) => {
  res.status(404).send(notFoundPage({ visitorName: req.visitorName }));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Retreat site listening on port ${port}`);
  console.log(`Days: ${DAYS.map((day) => day.label).join(', ')}`);
  console.log(`Sessions may run ${formatRange(8 * 60, 24 * 60)}`);
});
