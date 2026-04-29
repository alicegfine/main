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

    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      team TEXT NOT NULL,
      text TEXT NOT NULL,
      user_name TEXT,
      is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS question_upvotes (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(question_id, user_name)
    );

    CREATE TABLE IF NOT EXISTS logistics (
      id INTEGER PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agenda (
      id INTEGER PRIMARY KEY,
      content JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      user_name TEXT,
      is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      page_path TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS norms (
      id INTEGER PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dinner_plans (
      id SERIAL PRIMARY KEY,
      day INTEGER NOT NULL,
      restaurant_name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dinner_attendees (
      id SERIAL PRIMARY KEY,
      plan_id INTEGER NOT NULL REFERENCES dinner_plans(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      is_point_person BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(plan_id, user_name)
    );
  `);
  await pool.query(
    "INSERT INTO norms (id, content) VALUES (1, '') ON CONFLICT (id) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO logistics (id, content) VALUES (1, '') ON CONFLICT (id) DO NOTHING"
  );
  await pool.query(
    `INSERT INTO agenda (id, content) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify([
      { day: "Day 1", items: [] },
      { day: "Day 2", items: [] },
      { day: "Day 3", items: [] },
    ])]
  );
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
  const { rows: attendeeRows } = await pool.query(
    "SELECT session_id, user_name FROM attendees ORDER BY created_at"
  );

  const upvoteMap = Object.fromEntries(upvotes.map((u) => [u.target_id, u.count]));
  const attendeesMap: Record<number, string[]> = {};
  for (const r of attendeeRows) {
    (attendeesMap[r.session_id] ||= []).push(r.user_name);
  }

  return sessions.map((s) => ({
    ...fmtRow(s),
    upvotes: upvoteMap[s.id] || 0,
    attendees: attendeesMap[s.id] || [],
    attendee_count: (attendeesMap[s.id] || []).length,
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
  const { rows: upvoteRows } = await pool.query(
    "SELECT target_id, user_name FROM upvotes WHERE target_type = 'idea'"
  );

  const upvotersMap: Record<number, string[]> = {};
  for (const r of upvoteRows) {
    (upvotersMap[r.target_id] ||= []).push(r.user_name);
  }

  return ideas.map((i) => ({
    ...fmtRow(i),
    upvotes: (upvotersMap[i.id] || []).length,
    upvoters: upvotersMap[i.id] || [],
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

export async function updateIdea(
  id: number,
  data: { title?: string; description?: string; proposed_by?: string }
) {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM ideas WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  const current = rows[0];

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== current[key]) {
      setClauses.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) return fmtRow(current);

  values.push(id);
  await pool.query(`UPDATE ideas SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`, values);

  const { rows: updated } = await pool.query("SELECT * FROM ideas WHERE id = $1", [id]);
  return fmtRow(updated[0]);
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

export async function updateComment(id: number, text: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "UPDATE comments SET text = $1 WHERE id = $2 RETURNING *",
    [text, id]
  );
  if (rows.length === 0) return null;
  return fmtRow(rows[0]);
}

export async function deleteComment(id: number) {
  await ensureInit();
  await pool.query("DELETE FROM comments WHERE id = $1", [id]);
}

// ── Questions ──

export async function getAllQuestions(team?: string) {
  await ensureInit();
  const { rows: questions } = team
    ? await pool.query("SELECT * FROM questions WHERE team = $1 ORDER BY created_at DESC", [team])
    : await pool.query("SELECT * FROM questions ORDER BY created_at DESC");

  const { rows: upvoteRows } = await pool.query(
    "SELECT question_id, user_name FROM question_upvotes"
  );

  const upvoteMap: Record<number, string[]> = {};
  for (const r of upvoteRows) {
    (upvoteMap[r.question_id] ||= []).push(r.user_name);
  }

  return questions.map((q) => ({
    ...fmtRow(q),
    user_name: q.is_anonymous ? null : q.user_name,
    upvotes: (upvoteMap[q.id] || []).length,
    upvoters: upvoteMap[q.id] || [],
  }));
}

export async function createQuestion(data: {
  team: string;
  text: string;
  user_name: string | null;
  is_anonymous: boolean;
}) {
  await ensureInit();
  const { rows } = await pool.query(
    "INSERT INTO questions (team, text, user_name, is_anonymous) VALUES ($1, $2, $3, $4) RETURNING id",
    [data.team, data.text, data.is_anonymous ? null : data.user_name, data.is_anonymous]
  );
  return rows[0].id;
}

export async function updateQuestion(
  id: number,
  data: { text?: string; is_anonymous?: boolean }
) {
  await ensureInit();
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (data.text !== undefined) {
    setClauses.push(`text = $${paramIdx++}`);
    values.push(data.text);
  }
  if (data.is_anonymous !== undefined) {
    setClauses.push(`is_anonymous = $${paramIdx++}`);
    values.push(data.is_anonymous);
  }
  if (setClauses.length === 0) return null;

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE questions SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  if (rows.length === 0) return null;
  return fmtRow(rows[0]);
}

export async function deleteQuestion(id: number) {
  await ensureInit();
  await pool.query("DELETE FROM questions WHERE id = $1", [id]);
}

export async function toggleQuestionUpvote(questionId: number, userName: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "SELECT id FROM question_upvotes WHERE question_id = $1 AND user_name = $2",
    [questionId, userName]
  );
  if (rows.length > 0) {
    await pool.query(
      "DELETE FROM question_upvotes WHERE question_id = $1 AND user_name = $2",
      [questionId, userName]
    );
    return false;
  }
  await pool.query(
    "INSERT INTO question_upvotes (question_id, user_name) VALUES ($1, $2)",
    [questionId, userName]
  );
  return true;
}

// ── Agenda ──

export async function getAgenda() {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM agenda WHERE id = 1");
  return rows[0] ? { content: rows[0].content, updated_at: fmtTs(rows[0].updated_at) } : { content: [], updated_at: null };
}

export async function updateAgenda(content: any) {
  await ensureInit();
  const { rows } = await pool.query(
    "UPDATE agenda SET content = $1::jsonb, updated_at = NOW() WHERE id = 1 RETURNING *",
    [JSON.stringify(content)]
  );
  return { content: rows[0].content, updated_at: fmtTs(rows[0].updated_at) };
}

// ── Logistics ──

export async function getLogistics() {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM logistics WHERE id = 1");
  return rows[0] ? fmtRow(rows[0]) : { id: 1, content: "", updated_at: null };
}

export async function updateLogistics(content: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "UPDATE logistics SET content = $1, updated_at = NOW() WHERE id = 1 RETURNING *",
    [content]
  );
  return fmtRow(rows[0]);
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

// ── Suggestions ──

export async function createSuggestion(data: {
  text: string;
  user_name: string | null;
  is_anonymous: boolean;
  page_path: string;
}) {
  await ensureInit();
  const { rows } = await pool.query(
    `INSERT INTO suggestions (text, user_name, is_anonymous, page_path)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [data.text, data.is_anonymous ? null : data.user_name, data.is_anonymous, data.page_path]
  );
  return rows[0].id;
}

export async function getAllSuggestions() {
  await ensureInit();
  const { rows } = await pool.query(
    "SELECT * FROM suggestions ORDER BY created_at DESC"
  );
  return rows.map((r) => ({
    ...fmtRow(r),
    user_name: r.is_anonymous ? null : r.user_name,
  }));
}

export async function deleteSuggestion(id: number) {
  await ensureInit();
  await pool.query("DELETE FROM suggestions WHERE id = $1", [id]);
}

// ── Norms ──

export async function getNorms() {
  await ensureInit();
  const { rows } = await pool.query("SELECT * FROM norms WHERE id = 1");
  return rows[0] ? fmtRow(rows[0]) : { id: 1, content: "", updated_at: null };
}

export async function updateNorms(content: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "UPDATE norms SET content = $1, updated_at = NOW() WHERE id = 1 RETURNING *",
    [content]
  );
  return fmtRow(rows[0]);
}

// ── Dinner Plans ──

export async function getAllDinnerPlans() {
  await ensureInit();
  const { rows: plans } = await pool.query(
    "SELECT * FROM dinner_plans ORDER BY day, created_at"
  );
  const { rows: attendees } = await pool.query(
    "SELECT * FROM dinner_attendees ORDER BY created_at"
  );
  const attendeesByPlan: Record<number, { user_name: string; is_point_person: boolean }[]> = {};
  for (const a of attendees) {
    (attendeesByPlan[a.plan_id] ||= []).push({
      user_name: a.user_name,
      is_point_person: a.is_point_person,
    });
  }
  return plans.map((p) => ({
    ...fmtRow(p),
    attendees: attendeesByPlan[p.id] || [],
  }));
}

export async function createDinnerPlan(data: {
  day: number;
  restaurant_name: string;
  notes: string;
  created_by: string;
}) {
  await ensureInit();
  const { rows } = await pool.query(
    `INSERT INTO dinner_plans (day, restaurant_name, notes, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [data.day, data.restaurant_name, data.notes, data.created_by]
  );
  const planId = rows[0].id;
  await pool.query(
    "INSERT INTO dinner_attendees (plan_id, user_name) VALUES ($1, $2)",
    [planId, data.created_by]
  );
  return planId;
}

export async function updateDinnerPlan(
  id: number,
  data: { restaurant_name?: string; notes?: string }
) {
  await ensureInit();
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;
  if (data.restaurant_name !== undefined) {
    setClauses.push(`restaurant_name = $${paramIdx++}`);
    values.push(data.restaurant_name);
  }
  if (data.notes !== undefined) {
    setClauses.push(`notes = $${paramIdx++}`);
    values.push(data.notes);
  }
  if (setClauses.length === 0) return null;
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE dinner_plans SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return rows[0] ? fmtRow(rows[0]) : null;
}

export async function deleteDinnerPlan(id: number) {
  await ensureInit();
  await pool.query("DELETE FROM dinner_plans WHERE id = $1", [id]);
}

export async function joinDinnerPlan(planId: number, userName: string) {
  await ensureInit();
  await pool.query(
    `INSERT INTO dinner_attendees (plan_id, user_name) VALUES ($1, $2)
     ON CONFLICT (plan_id, user_name) DO NOTHING`,
    [planId, userName]
  );
}

export async function leaveDinnerPlan(planId: number, userName: string) {
  await ensureInit();
  await pool.query(
    "DELETE FROM dinner_attendees WHERE plan_id = $1 AND user_name = $2",
    [planId, userName]
  );
  // Auto-delete plan if no attendees remain
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int as count FROM dinner_attendees WHERE plan_id = $1",
    [planId]
  );
  if (rows[0].count === 0) {
    await pool.query("DELETE FROM dinner_plans WHERE id = $1", [planId]);
    return { planDeleted: true };
  }
  return { planDeleted: false };
}

export async function toggleDinnerPointPerson(planId: number, userName: string) {
  await ensureInit();
  const { rows } = await pool.query(
    "SELECT is_point_person FROM dinner_attendees WHERE plan_id = $1 AND user_name = $2",
    [planId, userName]
  );
  if (rows.length === 0) return false;
  const next = !rows[0].is_point_person;
  if (next) {
    await pool.query(
      "UPDATE dinner_attendees SET is_point_person = FALSE WHERE plan_id = $1",
      [planId]
    );
  }
  await pool.query(
    "UPDATE dinner_attendees SET is_point_person = $3 WHERE plan_id = $1 AND user_name = $2",
    [planId, userName, next]
  );
  return next;
}
