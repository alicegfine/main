import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "unconference.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initDb(_db);
  }
  return _db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      speaker TEXT NOT NULL,
      room TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      proposed_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS upvotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('session', 'idea')),
      target_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_type, target_id, user_name)
    );

    CREATE TABLE IF NOT EXISTS attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, user_name)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('session', 'idea')),
      target_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS edit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      edited_by TEXT NOT NULL,
      changes TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Sessions ──

export function getAllSessions() {
  const db = getDb();
  const sessions = db.prepare("SELECT * FROM sessions ORDER BY start_time, room").all();
  const upvotes = db.prepare(
    "SELECT target_id, COUNT(*) as count FROM upvotes WHERE target_type = 'session' GROUP BY target_id"
  ).all() as { target_id: number; count: number }[];
  const attendeeCounts = db.prepare(
    "SELECT session_id, COUNT(*) as count FROM attendees GROUP BY session_id"
  ).all() as { session_id: number; count: number }[];

  const upvoteMap = Object.fromEntries(upvotes.map((u) => [u.target_id, u.count]));
  const attendeeMap = Object.fromEntries(attendeeCounts.map((a) => [a.session_id, a.count]));

  return (sessions as any[]).map((s) => ({
    ...s,
    upvotes: upvoteMap[s.id] || 0,
    attendee_count: attendeeMap[s.id] || 0,
  }));
}

export function getSession(id: number) {
  const db = getDb();
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
  if (!session) return null;

  const upvotes = db.prepare(
    "SELECT COUNT(*) as count FROM upvotes WHERE target_type = 'session' AND target_id = ?"
  ).get(id) as { count: number };
  const upvoters = db.prepare(
    "SELECT user_name FROM upvotes WHERE target_type = 'session' AND target_id = ?"
  ).all(id) as { user_name: string }[];
  const attendees = db.prepare(
    "SELECT user_name FROM attendees WHERE session_id = ? ORDER BY created_at"
  ).all(id) as { user_name: string }[];
  const comments = db.prepare(
    "SELECT * FROM comments WHERE target_type = 'session' AND target_id = ? ORDER BY created_at"
  ).all(id);
  const editLogs = db.prepare(
    "SELECT * FROM edit_logs WHERE session_id = ? ORDER BY created_at DESC"
  ).all(id);

  return {
    ...session,
    upvotes: upvotes.count,
    upvoters: upvoters.map((u) => u.user_name),
    attendees: attendees.map((a) => a.user_name),
    comments,
    edit_logs: editLogs,
  };
}

export function createSession(data: {
  title: string;
  description: string;
  speaker: string;
  room: string;
  start_time: string;
  duration_minutes: number;
  created_by: string;
}) {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO sessions (title, description, speaker, room, start_time, duration_minutes, created_by)
     VALUES (@title, @description, @speaker, @room, @start_time, @duration_minutes, @created_by)`
  ).run(data);
  return result.lastInsertRowid;
}

export function updateSession(
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
  const db = getDb();
  const current = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
  if (!current) return null;

  const changes: Record<string, { from: any; to: any }> = {};
  const updates: string[] = [];
  const values: any = { id };

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== current[key]) {
      changes[key] = { from: current[key], to: value };
      updates.push(`${key} = @${key}`);
      values[key] = value;
    }
  }

  if (updates.length === 0) return current;

  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE sessions SET ${updates.join(", ")} WHERE id = @id`).run(values);

  db.prepare(
    "INSERT INTO edit_logs (session_id, edited_by, changes) VALUES (?, ?, ?)"
  ).run(id, editedBy, JSON.stringify(changes));

  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
}

export function deleteSession(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

// ── Ideas ──

export function getAllIdeas() {
  const db = getDb();
  const ideas = db.prepare("SELECT * FROM ideas ORDER BY created_at DESC").all();
  const upvotes = db.prepare(
    "SELECT target_id, COUNT(*) as count FROM upvotes WHERE target_type = 'idea' GROUP BY target_id"
  ).all() as { target_id: number; count: number }[];

  const upvoteMap = Object.fromEntries(upvotes.map((u) => [u.target_id, u.count]));

  return (ideas as any[]).map((i) => ({
    ...i,
    upvotes: upvoteMap[i.id] || 0,
  }));
}

export function getIdea(id: number) {
  const db = getDb();
  const idea = db.prepare("SELECT * FROM ideas WHERE id = ?").get(id) as any;
  if (!idea) return null;

  const upvotes = db.prepare(
    "SELECT COUNT(*) as count FROM upvotes WHERE target_type = 'idea' AND target_id = ?"
  ).get(id) as { count: number };
  const upvoters = db.prepare(
    "SELECT user_name FROM upvotes WHERE target_type = 'idea' AND target_id = ?"
  ).all(id) as { user_name: string }[];
  const comments = db.prepare(
    "SELECT * FROM comments WHERE target_type = 'idea' AND target_id = ? ORDER BY created_at"
  ).all(id);

  return {
    ...idea,
    upvotes: upvotes.count,
    upvoters: upvoters.map((u) => u.user_name),
    comments,
  };
}

export function createIdea(data: { title: string; description: string; proposed_by: string }) {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO ideas (title, description, proposed_by) VALUES (@title, @description, @proposed_by)"
  ).run(data);
  return result.lastInsertRowid;
}

export function deleteIdea(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM upvotes WHERE target_type = 'idea' AND target_id = ?").run(id);
  db.prepare("DELETE FROM comments WHERE target_type = 'idea' AND target_id = ?").run(id);
  db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
}

// ── Upvotes ──

export function toggleUpvote(targetType: "session" | "idea", targetId: number, userName: string) {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM upvotes WHERE target_type = ? AND target_id = ? AND user_name = ?"
  ).get(targetType, targetId, userName);

  if (existing) {
    db.prepare(
      "DELETE FROM upvotes WHERE target_type = ? AND target_id = ? AND user_name = ?"
    ).run(targetType, targetId, userName);
    return false; // removed
  } else {
    db.prepare(
      "INSERT INTO upvotes (target_type, target_id, user_name) VALUES (?, ?, ?)"
    ).run(targetType, targetId, userName);
    return true; // added
  }
}

// ── Attendees ──

export function toggleAttendance(sessionId: number, userName: string) {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id FROM attendees WHERE session_id = ? AND user_name = ?"
  ).get(sessionId, userName);

  if (existing) {
    db.prepare("DELETE FROM attendees WHERE session_id = ? AND user_name = ?").run(
      sessionId,
      userName
    );
    return false; // removed
  } else {
    db.prepare("INSERT INTO attendees (session_id, user_name) VALUES (?, ?)").run(
      sessionId,
      userName
    );
    return true; // added
  }
}

// ── Comments ──

export function addComment(
  targetType: "session" | "idea",
  targetId: number,
  userName: string,
  text: string
) {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO comments (target_type, target_id, user_name, text) VALUES (?, ?, ?, ?)"
  ).run(targetType, targetId, userName, text);
  return result.lastInsertRowid;
}

// ── Schedule an idea ──

export function scheduleIdea(
  ideaId: number,
  room: string,
  startTime: string,
  durationMinutes: number,
  scheduledBy: string
) {
  const db = getDb();
  const idea = db.prepare("SELECT * FROM ideas WHERE id = ?").get(ideaId) as any;
  if (!idea) return null;

  const sessionId = db.prepare(
    `INSERT INTO sessions (title, description, speaker, room, start_time, duration_minutes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(idea.title, idea.description, idea.proposed_by, room, startTime, durationMinutes, scheduledBy)
    .lastInsertRowid;

  // Move upvotes from idea to session
  db.prepare(
    "UPDATE upvotes SET target_type = 'session', target_id = ? WHERE target_type = 'idea' AND target_id = ?"
  ).run(sessionId, ideaId);

  // Move comments from idea to session
  db.prepare(
    "UPDATE comments SET target_type = 'session', target_id = ? WHERE target_type = 'idea' AND target_id = ?"
  ).run(sessionId, ideaId);

  // Delete the idea
  db.prepare("DELETE FROM ideas WHERE id = ?").run(ideaId);

  return sessionId;
}
