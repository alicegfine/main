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
// back with an empty schedule and its placeholder text — so both say so at
// startup and surface it in the UI for whoever can fix it.
export let storageAlert = null;

console.log(`Database file: ${path.resolve(dbPath)}`);

if (!path.isAbsolute(dataDir)) {
  // A relative DATA_DIR resolves against the working directory, which on a
  // container host is the deployed code — not a mounted volume. This is wrong
  // whether or not the file happens to exist right now, so it is checked first.
  storageAlert =
    `DATA_DIR is "${dataDir}", a relative path, so data is being written to ` +
    `${path.resolve(dataDir)} inside the app directory rather than to your mounted ` +
    `volume. Every deploy and restart discards it. Set DATA_DIR to the volume's ` +
    `mount path as an absolute path, such as /data.`;
  console.warn(storageAlert);
} else if (existedBefore) {
  console.log('Opened an existing database.');
} else if (!process.env.DATA_DIR) {
  storageAlert = `DATA_DIR is not set, so the schedule is being stored at ${path.resolve(dbPath)}, beside the code. On Railway that filesystem is rebuilt on every deploy and restart, so sessions and the spiel will keep vanishing. Attach a volume, then set DATA_DIR to its mount path.`;
  console.warn(storageAlert);
} else {
  storageAlert = `Started with an empty database at ${dbPath}. If there should have been data here, the volume mounted at ${dataDir} is not persisting between restarts.`;
  console.warn(storageAlert);
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

// The page was called "How it works" before it was called "The spiel"; carry any
// text already written across to the new slug.
db.prepare(`UPDATE pages SET slug = 'the-spiel' WHERE slug = 'how-it-works'`).run();

db.prepare(
  `INSERT INTO pages (slug, body, updated_at)
   VALUES ('the-spiel', ?, datetime('now'))
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
