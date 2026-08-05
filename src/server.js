import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import {
  DAYS,
  MAX_NAME_LENGTH,
  ROLES,
  formatRange,
  parseTime,
  validateBlock,
} from './retreat.js';
import {
  createBlock,
  createSignup,
  deleteBlock,
  deleteSignup,
  getBlock,
  getBlocksForDay,
  getPage,
  getScheduleByDay,
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
import { howItWorksPage, notFoundPage, schedulePage, signInPage } from './views.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(sessionMiddleware);
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
  'bad-password': 'That name and password did not match.',
  'name-required': 'Enter a name to sign up.',
  'bad-role': 'Choose whether you are attending or leading.',
  'unknown-block': 'That session no longer exists.',
  'name-taken': 'That name is already on the session.',
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
      notice,
      error,
    }),
  );
});

app.post('/signups', (req, res) => {
  const blockId = Number(req.body.block_id);
  const name = String(req.body.name ?? '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  const role = String(req.body.role ?? '');

  if (!Number.isInteger(blockId) || !getBlock(blockId)) {
    return res.redirect('/?error=unknown-block');
  }
  if (!name) return res.redirect('/?error=name-required');
  if (!ROLES.includes(role)) return res.redirect('/?error=bad-role');

  const result = createSignup({ blockId, name, role });
  if (!result.ok) {
    return res.redirect(`/?reason=${encodeURIComponent(result.error)}`);
  }
  return res.redirect('/?ok=signed-up');
});

app.post('/signups/:id/delete', (req, res) => {
  deleteSignup(Number(req.params.id));
  res.redirect('/?ok=removed');
});

app.post('/blocks', requireAdmin, (req, res) => {
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

app.post('/blocks/:id/delete', requireAdmin, (req, res) => {
  deleteBlock(Number(req.params.id));
  res.redirect('/?ok=block-deleted');
});

app.get('/how-it-works', (req, res) => {
  const { notice, error } = messagesFrom(req);
  res.send(
    howItWorksPage({
      page: getPage('how-it-works'),
      isAdmin: req.isAdmin,
      editing: req.isAdmin && req.query.edit === '1',
      notice,
      error,
    }),
  );
});

app.post('/how-it-works', requireAdmin, (req, res) => {
  const body = String(req.body.body ?? '').slice(0, 50_000);
  if (!body.trim()) {
    return res.redirect(
      `/how-it-works?edit=1&reason=${encodeURIComponent('The page cannot be empty.')}`,
    );
  }
  savePage('how-it-works', body);
  return res.redirect('/how-it-works?ok=saved');
});

app.get('/signin', (req, res) => {
  if (req.isAdmin) return res.redirect('/');
  const { error } = messagesFrom(req);
  return res.send(signInPage({ error }));
});

app.post('/signin', (req, res) => {
  if (!signInEnabled) return res.redirect('/signin');
  if (!checkCredentials(req.body.username, req.body.password)) {
    return res.redirect('/signin?error=bad-password');
  }
  issueSession(res);
  return res.redirect('/');
});

app.post('/signout', (req, res) => {
  clearSession(res);
  res.redirect('/?ok=signed-out');
});

app.use((req, res) => {
  res.status(404).send(notFoundPage());
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Retreat site listening on port ${port}`);
  console.log(`Days: ${DAYS.map((day) => day.label).join(', ')}`);
  console.log(`Sessions may run ${formatRange(8 * 60, 24 * 60)}`);
});
