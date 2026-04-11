import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data.json");

interface Session {
  id: number;
  title: string;
  description: string;
  speaker: string;
  room: string;
  start_time: string;
  duration_minutes: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Idea {
  id: number;
  title: string;
  description: string;
  proposed_by: string;
  created_at: string;
}

interface Upvote {
  id: number;
  target_type: "session" | "idea";
  target_id: number;
  user_name: string;
  created_at: string;
}

interface Attendee {
  id: number;
  session_id: number;
  user_name: string;
  created_at: string;
}

interface Comment {
  id: number;
  target_type: "session" | "idea";
  target_id: number;
  user_name: string;
  text: string;
  created_at: string;
}

interface EditLog {
  id: number;
  session_id: number;
  edited_by: string;
  changes: string;
  created_at: string;
}

interface Data {
  sessions: Session[];
  ideas: Idea[];
  upvotes: Upvote[];
  attendees: Attendee[];
  comments: Comment[];
  edit_logs: EditLog[];
  _nextId: Record<string, number>;
}

function now(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function readData(): Data {
  if (!fs.existsSync(DB_PATH)) {
    return {
      sessions: [],
      ideas: [],
      upvotes: [],
      attendees: [],
      comments: [],
      edit_logs: [],
      _nextId: { sessions: 1, ideas: 1, upvotes: 1, attendees: 1, comments: 1, edit_logs: 1 },
    };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeData(data: Data): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Sessions ──

export function getAllSessions() {
  const data = readData();
  return data.sessions
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.room.localeCompare(b.room))
    .map((s) => ({
      ...s,
      upvotes: data.upvotes.filter((u) => u.target_type === "session" && u.target_id === s.id).length,
      attendee_count: data.attendees.filter((a) => a.session_id === s.id).length,
    }));
}

export function getSession(id: number) {
  const data = readData();
  const session = data.sessions.find((s) => s.id === id);
  if (!session) return null;

  return {
    ...session,
    upvotes: data.upvotes.filter((u) => u.target_type === "session" && u.target_id === id).length,
    upvoters: data.upvotes
      .filter((u) => u.target_type === "session" && u.target_id === id)
      .map((u) => u.user_name),
    attendees: data.attendees
      .filter((a) => a.session_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => a.user_name),
    comments: data.comments
      .filter((c) => c.target_type === "session" && c.target_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    edit_logs: data.edit_logs
      .filter((e) => e.session_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export function createSession(input: {
  title: string;
  description: string;
  speaker: string;
  room: string;
  start_time: string;
  duration_minutes: number;
  created_by: string;
}) {
  const data = readData();
  const id = data._nextId.sessions++;
  const ts = now();
  data.sessions.push({ id, ...input, created_at: ts, updated_at: ts });
  writeData(data);
  return id;
}

export function updateSession(
  id: number,
  updates: {
    title?: string;
    description?: string;
    speaker?: string;
    room?: string;
    start_time?: string;
    duration_minutes?: number;
  },
  editedBy: string
) {
  const data = readData();
  const session = data.sessions.find((s) => s.id === id);
  if (!session) return null;

  const changes: Record<string, { from: any; to: any }> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== (session as any)[key]) {
      changes[key] = { from: (session as any)[key], to: value };
      (session as any)[key] = value;
    }
  }

  if (Object.keys(changes).length === 0) return session;

  session.updated_at = now();
  const logId = data._nextId.edit_logs++;
  data.edit_logs.push({
    id: logId,
    session_id: id,
    edited_by: editedBy,
    changes: JSON.stringify(changes),
    created_at: now(),
  });

  writeData(data);
  return session;
}

export function deleteSession(id: number) {
  const data = readData();
  data.sessions = data.sessions.filter((s) => s.id !== id);
  data.attendees = data.attendees.filter((a) => a.session_id !== id);
  data.upvotes = data.upvotes.filter((u) => !(u.target_type === "session" && u.target_id === id));
  data.comments = data.comments.filter((c) => !(c.target_type === "session" && c.target_id === id));
  data.edit_logs = data.edit_logs.filter((e) => e.session_id !== id);
  writeData(data);
}

// ── Ideas ──

export function getAllIdeas() {
  const data = readData();
  return data.ideas
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => ({
      ...i,
      upvotes: data.upvotes.filter((u) => u.target_type === "idea" && u.target_id === i.id).length,
    }));
}

export function getIdea(id: number) {
  const data = readData();
  const idea = data.ideas.find((i) => i.id === id);
  if (!idea) return null;

  return {
    ...idea,
    upvotes: data.upvotes.filter((u) => u.target_type === "idea" && u.target_id === id).length,
    upvoters: data.upvotes
      .filter((u) => u.target_type === "idea" && u.target_id === id)
      .map((u) => u.user_name),
    comments: data.comments
      .filter((c) => c.target_type === "idea" && c.target_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

export function createIdea(input: { title: string; description: string; proposed_by: string }) {
  const data = readData();
  const id = data._nextId.ideas++;
  data.ideas.push({ id, ...input, created_at: now() });
  writeData(data);
  return id;
}

export function deleteIdea(id: number) {
  const data = readData();
  data.ideas = data.ideas.filter((i) => i.id !== id);
  data.upvotes = data.upvotes.filter((u) => !(u.target_type === "idea" && u.target_id === id));
  data.comments = data.comments.filter((c) => !(c.target_type === "idea" && c.target_id === id));
  writeData(data);
}

// ── Upvotes ──

export function toggleUpvote(targetType: "session" | "idea", targetId: number, userName: string) {
  const data = readData();
  const idx = data.upvotes.findIndex(
    (u) => u.target_type === targetType && u.target_id === targetId && u.user_name === userName
  );

  if (idx !== -1) {
    data.upvotes.splice(idx, 1);
    writeData(data);
    return false;
  } else {
    const id = data._nextId.upvotes++;
    data.upvotes.push({ id, target_type: targetType, target_id: targetId, user_name: userName, created_at: now() });
    writeData(data);
    return true;
  }
}

// ── Attendees ──

export function toggleAttendance(sessionId: number, userName: string) {
  const data = readData();
  const idx = data.attendees.findIndex(
    (a) => a.session_id === sessionId && a.user_name === userName
  );

  if (idx !== -1) {
    data.attendees.splice(idx, 1);
    writeData(data);
    return false;
  } else {
    const id = data._nextId.attendees++;
    data.attendees.push({ id, session_id: sessionId, user_name: userName, created_at: now() });
    writeData(data);
    return true;
  }
}

// ── Comments ──

export function addComment(
  targetType: "session" | "idea",
  targetId: number,
  userName: string,
  text: string
) {
  const data = readData();
  const id = data._nextId.comments++;
  data.comments.push({ id, target_type: targetType, target_id: targetId, user_name: userName, text, created_at: now() });
  writeData(data);
  return id;
}

// ── Schedule an idea ──

export function scheduleIdea(
  ideaId: number,
  room: string,
  startTime: string,
  durationMinutes: number,
  scheduledBy: string
) {
  const data = readData();
  const idea = data.ideas.find((i) => i.id === ideaId);
  if (!idea) return null;

  const sessionId = data._nextId.sessions++;
  const ts = now();
  data.sessions.push({
    id: sessionId,
    title: idea.title,
    description: idea.description,
    speaker: idea.proposed_by,
    room,
    start_time: startTime,
    duration_minutes: durationMinutes,
    created_by: scheduledBy,
    created_at: ts,
    updated_at: ts,
  });

  // Move upvotes and comments from idea to session
  data.upvotes.forEach((u) => {
    if (u.target_type === "idea" && u.target_id === ideaId) {
      u.target_type = "session";
      u.target_id = sessionId;
    }
  });
  data.comments.forEach((c) => {
    if (c.target_type === "idea" && c.target_id === ideaId) {
      c.target_type = "session";
      c.target_id = sessionId;
    }
  });

  // Remove the idea
  data.ideas = data.ideas.filter((i) => i.id !== ideaId);

  writeData(data);
  return sessionId;
}
