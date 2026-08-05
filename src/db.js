import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Paragraphs are kept on single lines on purpose: a line break in the source is
// rendered as a line break on the page, the same as pressing Enter in the editor.
const DEFAULT_PAGE_BODY = [
  '## What to expect',
  'Four days of sitting together, from Friday morning through Monday night. Come for a single session or stay for the whole thing — there is no expectation that anyone attends everything.',
  '## The rhythm of a day',
  'Sessions run between 8:00 AM and midnight. Each one has a person leading it, who keeps time and rings the bell. Everything in between is unstructured: rest, walk, eat, read.',
  '## What to bring',
  'Comfortable clothes you can sit still in, and a water bottle. Cushions and mats are provided.',
  '## Signing up',
  'Use the schedule page to add your name to any session, either as someone attending or as the person leading it. You can take your name back off at any time.',
].join('\n\n');

const dataDir = process.env.DATA_DIR || './data';
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'retreat.db');
const existedBefore = fs.existsSync(dbPath);

// Losing the database is otherwise silent from the outside — the site just comes
// back with an empty schedule and its placeholder text — so report the state at
// startup and surface it in the UI for whoever can fix it.
//
// A misconfigured path can be identified outright. An empty database cannot: on
// the first run against a fresh volume it is entirely normal, and a wiped store
// by definition cannot remember that it was ever written to. So that case is
// reported as something to confirm on the next restart, not as a failure.
export let storageStatus = null; // { level: 'error' | 'info', message }

console.log(`Database file: ${path.resolve(dbPath)}`);

if (!path.isAbsolute(dataDir)) {
  // A relative path — whether set explicitly or left to default — resolves against
  // the working directory, which on a container host is the deployed code rather
  // than a mounted volume. That is wrong regardless of whether the file happens to
  // exist at this moment, so it is checked before anything else.
  const how = process.env.DATA_DIR
    ? `DATA_DIR is "${dataDir}", a relative path`
    : `DATA_DIR is not set and falls back to the relative "${dataDir}"`;
  storageStatus = {
    level: 'error',
    message:
      `${how}, so data is being written to ${path.resolve(dataDir)} inside the app ` +
      `directory rather than to a mounted volume. Every deploy and restart discards ` +
      `it. Set DATA_DIR to the volume's mount path as an absolute path, such as /data.`,
  };
} else if (!existedBefore) {
  storageStatus = {
    level: 'info',
    message:
      `This is a new, empty database at ${path.resolve(dbPath)}. That is expected the ` +
      `first time after pointing DATA_DIR at a fresh volume. To confirm the volume ` +
      `keeps data, redeploy once: the logs should then say it opened an existing ` +
      `database on boot 2, and this notice will disappear.`,
  };
}

if (storageStatus) {
  console[storageStatus.level === 'error' ? 'warn' : 'log'](storageStatus.message);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('attending', 'leading')),
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS signups_block_id ON signups(block_id);

  CREATE TABLE IF NOT EXISTS pages (
    slug TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Counting boots against this database is the one honest test of whether the
// volume persists: after a few redeploys it should be climbing. If every deploy
// logs boot 1, the store is being thrown away each time.
const bootCount = Number(
  db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('boot_count', '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
       RETURNING value`,
    )
    .get().value,
);
console.log(
  existedBefore
    ? `Opened an existing database. This is boot ${bootCount} against it.`
    : `This is boot ${bootCount} against a brand new database.`,
);

// The page has been renamed twice — "How it works", then "The spiel", now "Info".
// Applying both steps in order carries across text written under either old name.
db.prepare(`UPDATE pages SET slug = 'the-spiel' WHERE slug = 'how-it-works'`).run();
db.prepare(`UPDATE pages SET slug = 'info' WHERE slug = 'the-spiel'`).run();

db.prepare(
  `INSERT INTO pages (slug, body, updated_at)
   VALUES ('info', ?, datetime('now'))
   ON CONFLICT(slug) DO NOTHING`,
).run(DEFAULT_PAGE_BODY);

const statements = {
  blocksForDay: db.prepare(
    'SELECT * FROM blocks WHERE day = ? ORDER BY start_min, end_min',
  ),
  allBlocks: db.prepare('SELECT * FROM blocks ORDER BY day, start_min, end_min'),
  insertBlock: db.prepare(
    `INSERT INTO blocks (day, start_min, end_min, created_at)
     VALUES (@day, @startMin, @endMin, datetime('now'))`,
  ),
  updateBlockTimes: db.prepare(
    'UPDATE blocks SET start_min = @startMin, end_min = @endMin WHERE id = @id',
  ),
  deleteBlock: db.prepare('DELETE FROM blocks WHERE id = ?'),
  blockById: db.prepare('SELECT * FROM blocks WHERE id = ?'),
  allSignups: db.prepare('SELECT * FROM signups ORDER BY role DESC, created_at'),
  insertSignup: db.prepare(
    `INSERT INTO signups (block_id, name, role, created_at)
     VALUES (@blockId, @name, @role, datetime('now'))`,
  ),
  signupById: db.prepare('SELECT * FROM signups WHERE id = ?'),
  deleteSignup: db.prepare('DELETE FROM signups WHERE id = ?'),
  duplicateSignup: db.prepare(
    `SELECT id FROM signups
     WHERE block_id = ? AND role = ? AND lower(name) = lower(?)`,
  ),
  leaderFor: db.prepare(`SELECT * FROM signups WHERE block_id = ? AND role = 'leading'`),
  deleteRoleFor: db.prepare(
    `DELETE FROM signups
     WHERE block_id = ? AND role = ? AND lower(name) = lower(?)`,
  ),
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  putSetting: db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ),
  getPage: db.prepare('SELECT body, updated_at FROM pages WHERE slug = ?'),
  updatePage: db.prepare(
    `UPDATE pages SET body = ?, updated_at = datetime('now') WHERE slug = ?`,
  ),
};

export function getBlocksForDay(day) {
  return statements.blocksForDay.all(day);
}

// Returns every block, each with its signups attached, grouped by day in
// retreat order.
export function getScheduleByDay(days) {
  const blocks = statements.allBlocks.all();
  const signups = statements.allSignups.all();

  const byBlock = new Map();
  for (const block of blocks) {
    byBlock.set(block.id, { ...block, leading: [], attending: [] });
  }
  for (const signup of signups) {
    const block = byBlock.get(signup.block_id);
    if (!block) continue;
    block[signup.role === 'leading' ? 'leading' : 'attending'].push(signup);
  }

  return days.map((day) => ({
    ...day,
    blocks: blocks
      .filter((block) => block.day === day.date)
      .map((block) => byBlock.get(block.id)),
  }));
}

export function createBlock({ day, startMin, endMin }) {
  return statements.insertBlock.run({ day, startMin, endMin });
}

export function updateBlockTimes({ id, startMin, endMin }) {
  return statements.updateBlockTimes.run({ id, startMin, endMin });
}

export function deleteBlock(id) {
  return statements.deleteBlock.run(id);
}

export function getLeader(blockId) {
  return statements.leaderFor.get(blockId);
}

export function getBlock(id) {
  return statements.blockById.get(id);
}

// A session has at most one leader, and nobody holds two roles in the same
// session: offering to lead takes you off that session's attending list.
export function createSignup({ blockId, name, role }) {
  if (statements.duplicateSignup.get(blockId, role, name)) {
    return { ok: false, error: `${name} is already signed up to that session.` };
  }

  const leader = statements.leaderFor.get(blockId);

  if (role === 'leading') {
    if (leader) {
      return { ok: false, error: `${leader.name} is already leading that session.` };
    }
    statements.deleteRoleFor.run(blockId, 'attending', name);
  } else if (leader && leader.name.toLowerCase() === name.toLowerCase()) {
    return { ok: false, error: 'You are leading that session.' };
  }

  statements.insertSignup.run({ blockId, name, role });
  return { ok: true };
}

export function getSignup(id) {
  return statements.signupById.get(id);
}

export function deleteSignup(id) {
  return statements.deleteSignup.run(id);
}

export function getSetting(key) {
  return statements.getSetting.get(key)?.value ?? null;
}

// The two buttons at the top of the schedule. The sit link in particular changes
// often, so both are stored rather than hard-coded.
export function getLinks() {
  return {
    sit: getSetting('link_sit_url') ?? '',
    signal: getSetting('link_signal_url') ?? '',
  };
}

export function saveLinks({ sit, signal }) {
  putSetting('link_sit_url', sit);
  putSetting('link_signal_url', signal);
}

export function putSetting(key, value) {
  return statements.putSetting.run(key, value);
}

export function getPage(slug) {
  return statements.getPage.get(slug);
}

export function savePage(slug, body) {
  return statements.updatePage.run(body, slug);
}

export default db;
