import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let _initialized = false;

async function ensureInit() {
  if (_initialized) return;
  _initialized = true;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      speaker TEXT NOT NULL,
      room TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      proposed_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS upvotes (
      id SERIAL PRIMARY KEY,
      target_type TEXT NOT NULL CHECK(target_type IN ('session', 'idea')),
      target_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(target_type, target_id, user_name)
    );

    CREATE TABLE IF NOT EXISTS attendees (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(session_id, user_name)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      target_type TEXT NOT NULL CHECK(target_type IN ('session', 'idea')),
      target_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS edit_logs (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      edited_by TEXT NOT NULL,
      changes TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function fmtTs(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function fmtRow(row: any) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at) out.created_at = fmtTs(out.created_at);
  if (out.updated_at) out.updated_at = fmtTs(out.updated_at);
  return out;
}

// ── Sessions ──

export async function getAllSessions() {
  await ensureInit();
  const { rows: sessions } = await pool.query(
    "SELECT * FROM sessions ORDER BY start_time, room"
  );
  const { rows: upvotes } = await pool.query(
    "SELECT target_id, COUNT(*)::int as count FROM upvotes WHERE target_type = 'session' GROUP BY target_id"
  );
  const { rows: attendeeCounts } = await pool.query(
    "SELECT session_id, COUNT(*)::int as count FROM attendees GROUP BY session_id"
  );

  const upvoteMap = Object.fromEntries(upvotes.map((u) => [u.target_id, u.count]));
  const attendeeMap = Object.fromEntries(attendeeCounts.map((a) => [a.session_id, a.count]));

  return sessions.map((s) => ({
    ...fmtRow(s),
    upvotes: upvoteMap[s.id] || 0,
    attendee_count: attendeeMap[s.id] || 0,
  }));
}

export async function getSession(id: number) {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  const session = fmtRow(rows[0]);

  const { rows: upvoteRows } = await pool.query(
    "SELECT user_name FROM upvotes WHERE target_type = 'session' AND target_id = $1",
    [id]
  );
  const { rows: attendeeRows } = await pool.query(
    "SELECT user_name FROM attendees WHERE session_id = $1 ORDER BY created_at",
    [id]
  );
  const { rows: commentRows } = await pool.query(
    "SELECT * FROM comments WHERE target_type = 'session' AND target_id = $1 ORDER BY created_at",
    [id]
  );
  const { rows: editLogRows } = await pool.query(
    "SELECT * FROM edit_logs WHERE session_id = $1 ORDER BY created_at DESC",
    [id]
  );

  return {
    ...session,
    upvotes: upvoteRows.length,
    upvoters: upvoteRows.map((u) => u.user_name),
    attendees: attendeeRows.map((a) => a.user_name),
    comments: commentRows.map(fmtRow),
    edit_logs: editLogRows.map(fmtRow),
  };
}

export async function createSession(data: {
  title: string;
  description: string;
  speaker: string;
  room: string;
  start_time: string;
  duration_minutes: number;
  created_by: string;
}) {
  await ensureInit();
  const { rows } = await pool.query(
    `INSERT INTO sessions (title, description, speaker, room, start_time, duration_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [data.title, data.description, data.speaker, data.room, data.start_time, data.duration_minutes, data.created_by]
  );
  return rows[0].id;
}

export async function updateSession(
  id: number,
  data: {
    title?: string;
    description?: string;
    speaker?: string;
    room?: string;
    start_time?: string;
    duration_minutes?: number;
  },
  editedBy: string
) {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  const current = rows[0];

  const changes: Record<string, { from: any; to: any }> = {};
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== current[key]) {
      changes[key] = { from: current[key], to: value };
      setClauses.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) return fmtRow(current);

  setClauses.push(`updated_at = NOW()`);
  values.push(id);
  await pool.query(
    `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
    values
  );

  await pool.query(
    "INSERT INTO edit_logs (session_id, edited_by, changes) VALUES ($1, $2, $3)",
    [id, editedBy, JSON.stringify(changes)]
  );

  const { rows: updated } = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
  return fmtRow(updated[0]);
}

export async function deleteSession(id: number) {
  await ensureInit();
  await pool.query("DELETE FROM sessions WHERE id = $1", [id]);
}

// ── Ideas ──

export async function getAllIdeas() {
  await ensureInit();
  const { rows: ideas } = await pool.query("SELECT * FROM ideas ORDER BY created_at DESC");
  const { rows: upvotes } = await pool.query(
    "SELECT target_id, COUNT(*)::int as count FROM upvotes WHERE target_type = 'idea' GROUP BY target_id"
  );

  const upvoteMap = Object.fromEntries(upvotes.map((u) => [u.target_id, u.count]));

  return ideas.map((i) => ({
    ...fmtRow(i),
    upvotes: upvoteMap[i.id] || 0,
  }));
}

export async function getIdea(id: number) {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM ideas WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  const idea = fmtRow(rows[0]);

  const { rows: upvoteRows } = await pool.query(
    "SELECT user_name FROM upvotes WHERE target_type = 'idea' AND target_id = $1",
    [id]
  );
  const { rows: commentRows } = await pool.query(
    "SELECT * FROM comments WHERE target_type = 'idea' AND target_id = $1 ORDER BY created_at",
    [id]
  );

  return {
    ...idea,
    upvotes: upvoteRows.length,
    upvoters: upvoteRows.map((u) => u.user_name),
    comments: commentRows.map(fmtRow),
  };
}

export async function createIdea(data: { title: string; description: string; proposed_by: string }) {
  await ensureInit();
  const { rows } = await pool.query(
    "INSERT INTO ideas (title, description, proposed_by) VALUES ($1, $2, $3) RETURNING id",
    [data.title, data.description, data.proposed_by]
  );
  return rows[0].id;
}

export async function deleteIdea(id: number) {
  await ensureInit();
  await pool.query("DELETE FROM upvotes WHERE target_type = 'idea' AND target_id = $1", [id]);
  await pool.query("DELETE FROM comments WHERE target_type = 'idea' AND target_id = $1", [id]);
  await pool.query("DELETE FROM ideas WHERE id = $1", [id]);
}

// ── Upvotes ──

export async function toggleUpvote(targetType: "session" | "idea", targetId: number, userName: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "SELECT id FROM upvotes WHERE target_type = $1 AND target_id = $2 AND user_name = $3",
    [targetType, targetId, userName]
  );

  if (rows.length > 0) {
    await pool.query(
      "DELETE FROM upvotes WHERE target_type = $1 AND target_id = $2 AND user_name = $3",
      [targetType, targetId, userName]
    );
    return false;
  } else {
    await pool.query(
      "INSERT INTO upvotes (target_type, target_id, user_name) VALUES ($1, $2, $3)",
      [targetType, targetId, userName]
    );
    return true;
  }
}

// ── Attendees ──

export async function toggleAttendance(sessionId: number, userName: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "SELECT id FROM attendees WHERE session_id = $1 AND user_name = $2",
    [sessionId, userName]
  );

  if (rows.length > 0) {
    await pool.query("DELETE FROM attendees WHERE session_id = $1 AND user_name = $2", [sessionId, userName]);
    return false;
  } else {
    await pool.query("INSERT INTO attendees (session_id, user_name) VALUES ($1, $2)", [sessionId, userName]);
    return true;
  }
}

// ── Comments ──

export async function addComment(
  targetType: "session" | "idea",
  targetId: number,
  userName: string,
  text: string
) {
  await ensureInit();
  const { rows } = await pool.query(
    "INSERT INTO comments (target_type, target_id, user_name, text) VALUES ($1, $2, $3, $4) RETURNING id",
    [targetType, targetId, userName, text]
  );
  return rows[0].id;
}

// ── Schedule an idea ──

export async function scheduleIdea(
  ideaId: number,
  room: string,
  startTime: string,
  durationMinutes: number,
  scheduledBy: string
) {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM ideas WHERE id = $1", [ideaId]);
  if (rows.length === 0) return null;
  const idea = rows[0];

  const { rows: sessionRows } = await pool.query(
    `INSERT INTO sessions (title, description, speaker, room, start_time, duration_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [idea.title, idea.description, idea.proposed_by, room, startTime, durationMinutes, scheduledBy]
  );
  const sessionId = sessionRows[0].id;

  await pool.query(
    "UPDATE upvotes SET target_type = 'session', target_id = $1 WHERE target_type = 'idea' AND target_id = $2",
    [sessionId, ideaId]
  );
  await pool.query(
    "UPDATE comments SET target_type = 'session', target_id = $1 WHERE target_type = 'idea' AND target_id = $2",
    [sessionId, ideaId]
  );
  await pool.query("DELETE FROM ideas WHERE id = $1", [ideaId]);

  return sessionId;
}
