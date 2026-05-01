"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";

const ROOMS = ["Anderson A", "Anderson B", "Bleury"];
const ROOM_COLORS: Record<string, string> = {
  "Anderson A": "bg-blue-100 text-blue-800",
  "Anderson B": "bg-emerald-100 text-emerald-800",
  Bleury: "bg-violet-100 text-violet-800",
};

interface Session {
  id: number;
  title: string;
  description: string;
  speaker: string;
  room: string;
  start_time: string;
  duration_minutes: number;
  upvotes: number;
  attendee_count: number;
  attendees: string[];
}

interface Idea {
  id: number;
  title: string;
  description: string;
  proposed_by: string;
  upvotes: number;
  upvoters: string[];
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMinutes(t: string, mins: number): string {
  const total = timeToMinutes(t) + mins;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function getBlock(startTime: string): 1 | 2 | null {
  const mins = timeToMinutes(startTime);
  if (mins >= timeToMinutes("13:30") && mins < timeToMinutes("15:00")) return 1;
  if (mins >= timeToMinutes("15:15") && mins < timeToMinutes("16:45")) return 2;
  return null;
}

const SLOTS = [
  { id: 1, label: "1:30 – 2:15 PM", start: "13:30", end: "14:15" },
  { id: 2, label: "2:15 – 3:00 PM", start: "14:15", end: "15:00" },
  { id: 3, label: "3:15 – 4:00 PM", start: "15:15", end: "16:00" },
  { id: 4, label: "4:00 – 4:45 PM", start: "16:00", end: "16:45" },
];

function getSlot(startTime: string): number | null {
  const mins = timeToMinutes(startTime);
  for (const slot of SLOTS) {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);
    if (mins >= slotStart && mins < slotEnd) return slot.id;
  }
  return null;
}

// ── Name Prompt ──

function NamePrompt({ onSet }: { onSet: (name: string) => void }) {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
      <div className="card p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-navy-800 mb-2">Welcome to Montreal Offsite</h2>
        <p className="text-slate-500 mb-6">Enter your name to get started.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSet(name.trim());
          }}
        >
          <input
            className="input mb-4"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary w-full" disabled={!name.trim()}>
            Let&apos;s go
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Add Session Modal ──

function AddSessionModal({
  block,
  onClose,
  userName,
  onCreated,
}: {
  block: 1 | 2;
  onClose: () => void;
  userName: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [host, setHost] = useState(userName);
  const [room, setRoom] = useState(ROOMS[0]);
  const [startTime, setStartTime] = useState(block === 1 ? "13:30" : "15:15");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        speaker: host,
        room,
        start_time: startTime,
        duration_minutes: 45,
        created_by: userName,
      }),
    });
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
      <div className="card p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy-800">Add Session</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Host</label>
            <input className="input" value={host} onChange={(e) => setHost(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Room</label>
            <select className="input" value={room} onChange={(e) => setRoom(e.target.value)}>
              {ROOMS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start time</label>
            <input
              type="time"
              className="input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              min={block === 1 ? "13:30" : "15:15"}
              max={block === 1 ? "14:59" : "16:44"}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting || !title.trim()}>
            {submitting ? "Creating..." : "Create Session"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Propose Idea Modal ──

function ProposeIdeaModal({
  onClose,
  userName,
  onCreated,
}: {
  onClose: () => void;
  userName: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [proposedBy, setProposedBy] = useState(userName);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, proposed_by: proposedBy }),
    });
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
      <div className="card p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-navy-800">Propose an idea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Proposed by</label>
            <input
              className="input"
              value={proposedBy}
              onChange={(e) => setProposedBy(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting || !title.trim() || !proposedBy.trim()}>
            {submitting ? "Submitting..." : "Submit Idea"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Schedule Idea Modal ──

function ScheduleIdeaModal({
  idea,
  onClose,
  userName,
  onScheduled,
}: {
  idea: Idea;
  onClose: () => void;
  userName: string;
  onScheduled: () => void;
}) {
  const [room, setRoom] = useState(ROOMS[0]);
  const [startTime, setStartTime] = useState("13:30");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`/api/ideas/${idea.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        start_time: startTime,
        duration_minutes: 45,
        scheduled_by: userName,
      }),
    });
    onScheduled();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
      <div className="card p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-navy-800">Schedule This Idea</h2>
            <p className="text-slate-500 text-sm mt-1">{idea.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Room</label>
            <select className="input" value={room} onChange={(e) => setRoom(e.target.value)}>
              {ROOMS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start time</label>
            <input
              type="time"
              className="input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Scheduling..." : "Add to Schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Conflict Detection ──

function hasConflict(session: Session, allSessions: Session[]): boolean {
  const start = timeToMinutes(session.start_time);
  const end = start + session.duration_minutes;
  return allSessions.some((other) => {
    if (other.id === session.id || other.room !== session.room) return false;
    const otherStart = timeToMinutes(other.start_time);
    const otherEnd = otherStart + other.duration_minutes;
    return start < otherEnd && end > otherStart;
  });
}

// ── Session Card ──

function SessionCard({ session, allSessions, userName }: { session: Session; allSessions: Session[]; userName?: string }) {
  const endTime = addMinutes(session.start_time, session.duration_minutes);
  const conflict = hasConflict(session, allSessions);
  const isAttending = userName ? (session.speaker === userName || session.attendees?.includes(userName)) : false;
  return (
    <Link href={`/session/${session.id}`}>
      <div className={`card p-4 hover:shadow-md transition-shadow cursor-pointer group ${conflict ? "border-amber-400 bg-amber-50/50" : isAttending ? "ring-2 ring-navy-400 bg-navy-50/30" : ""}`}>
        {conflict && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Time conflict
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 mb-1">
            {formatTime(session.start_time)} &ndash; {formatTime(endTime)}
          </p>
          <h3 className="font-semibold text-navy-800 group-hover:text-navy-600 truncate">
            {session.title}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">hosted by {session.speaker}</p>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
            {session.upvotes}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {session.attendee_count} attending
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Idea Card ──

function IdeaCard({
  idea,
  userName,
  onUpvote,
  onSchedule,
}: {
  idea: Idea;
  userName: string;
  onUpvote: () => void;
  onSchedule: () => void;
}) {
  const [voting, setVoting] = useState(false);
  const hasUpvoted = userName ? idea.upvoters?.includes(userName) : false;

  async function handleUpvote(e: React.MouseEvent) {
    e.preventDefault();
    setVoting(true);
    await fetch(`/api/ideas/${idea.id}/upvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName }),
    });
    onUpvote();
    setVoting(false);
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={handleUpvote}
          disabled={voting}
          className={`flex flex-col items-center pt-0.5 transition-colors ${
            hasUpvoted ? "text-navy-600" : "text-slate-400 hover:text-navy-600"
          }`}
        >
          <svg className="w-5 h-5" fill={hasUpvoted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-sm font-semibold">{idea.upvotes}</span>
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/idea/${idea.id}`}>
            <h3 className="font-semibold text-navy-800 hover:text-navy-600">{idea.title}</h3>
          </Link>
          {idea.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{idea.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-400">by {idea.proposed_by}</span>
            <button
              onClick={onSchedule}
              className="text-xs font-medium text-navy-600 hover:text-navy-800 transition-colors"
            >
              Schedule this &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function HomePage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"schedule" | "ideas" | "mine">("schedule");
  const [addSessionBlock, setAddSessionBlock] = useState<1 | 2 | null>(null);
  const [showProposeIdea, setShowProposeIdea] = useState(false);
  const [scheduleIdea, setScheduleIdea] = useState<Idea | null>(null);
  const [ideaSort, setIdeaSort] = useState<"upvotes" | "newest">("upvotes");

  const { data: sessions, mutate: mutateSessions } = useSWR<Session[]>("/api/sessions", fetcher, {
    refreshInterval: 3000,
  });
  const { data: ideas, mutate: mutateIdeas } = useSWR<Idea[]>("/api/ideas", fetcher, {
    refreshInterval: 3000,
  });

  useEffect(() => {
    const stored = localStorage.getItem("sut_name") || localStorage.getItem("unconference_name");
    if (stored) setUserName(stored);
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "ideas" || t === "mine") setTab(t);
    setLoaded(true);
  }, []);

  const handleSetName = useCallback((name: string) => {
    localStorage.setItem("sut_name", name);
    setUserName(name);
  }, []);

  if (!loaded) return null;

  const block1Sessions = (sessions || []).filter((s) => getBlock(s.start_time) === 1);
  const block2Sessions = (sessions || []).filter((s) => getBlock(s.start_time) === 2);

  const allSessions = sessions || [];

  function renderRoomColumn(roomSessions: Session[], room: string) {
    const sorted = roomSessions
      .filter((s) => s.room === room)
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

    if (sorted.length === 0) {
      return (
        <p className="text-sm text-slate-400 italic py-4 text-center">No sessions yet</p>
      );
    }

    return (
      <div className="space-y-3">
        {sorted.map((s) => (
          <SessionCard key={s.id} session={s} allSessions={allSessions} userName={userName || undefined} />
        ))}
      </div>
    );
  }

  function renderBlock(blockNum: 1 | 2, blockSessions: Session[], timeLabel: string) {
    return (
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-navy-800">Block {blockNum}</h2>
            <span className="text-sm text-slate-500">{timeLabel}</span>
          </div>
          {userName && (
            <button
              onClick={() => setAddSessionBlock(blockNum)}
              className="btn-ghost text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Session
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ROOMS.map((room) => (
            <div key={room}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`badge ${ROOM_COLORS[room]}`}>{room}</span>
              </div>
              {renderRoomColumn(blockSessions, room)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sortedIdeas = [...(ideas || [])].sort((a, b) =>
    ideaSort === "upvotes" ? b.upvotes - a.upvotes : b.id - a.id
  );

  const mySessions = userName
    ? (sessions || [])
        .filter((s) => s.speaker === userName || s.attendees?.includes(userName))
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    : [];

  return (
    <>
      {!userName && <NamePrompt onSet={handleSetName} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-navy-900 tracking-tight">Team-led sessions</h1>
            <p className="text-slate-500 mt-1">Montreal Offsite &middot; Day 2</p>
          </div>
          {userName && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                Signed in as <span className="font-medium text-navy-700">{userName}</span>
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem("sut_name");
                  localStorage.removeItem("unconference_name");
                  setUserName(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                change
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 mb-8">
          <nav className="flex gap-8">
            <button
              onClick={() => setTab("schedule")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "schedule"
                  ? "border-navy-700 text-navy-800"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => setTab("ideas")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "ideas"
                  ? "border-navy-700 text-navy-800"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Idea Board
              {ideas && ideas.length > 0 && (
                <span className="ml-2 badge bg-navy-100 text-navy-700">{ideas.length}</span>
              )}
            </button>
            {userName && (
              <button
                onClick={() => setTab("mine")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === "mine"
                    ? "border-navy-700 text-navy-800"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                My Sessions
                {mySessions.length > 0 && (
                  <span className="ml-2 badge bg-navy-100 text-navy-700">{mySessions.length}</span>
                )}
              </button>
            )}
          </nav>
        </div>

        {/* Schedule Tab */}
        {tab === "schedule" && (
          <div>
            {renderBlock(1, block1Sessions, "1:30 PM \u2013 3:00 PM")}

            <div className="flex items-center gap-4 my-8">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                Break &middot; 3:00 &ndash; 3:15 PM
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {renderBlock(2, block2Sessions, "3:15 PM \u2013 4:45 PM")}

            {(!sessions || sessions.length === 0) && (
              <div className="text-center py-16">
                <p className="text-slate-400 text-lg">No sessions scheduled yet.</p>
                <p className="text-slate-400 text-sm mt-1">
                  Add a session above or propose an idea on the Idea Board.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Ideas Tab */}
        {tab === "ideas" && (
          <div>
            <p className="text-sm text-slate-500 mb-4">
              Sessions are 45 minutes. Upvote ideas you&apos;d like to see, or schedule one into an open slot.
            </p>
            <div className="flex flex-col items-start gap-4 mb-6">
              {userName && (
                <button onClick={() => setShowProposeIdea(true)} className="btn-primary text-sm">
                  Propose an idea
                </button>
              )}
              <select
                className="text-sm border border-slate-300 rounded-md px-3 py-1.5 text-slate-600"
                value={ideaSort}
                onChange={(e) => setIdeaSort(e.target.value as "upvotes" | "newest")}
              >
                <option value="upvotes">Most upvoted</option>
                <option value="newest">Newest first</option>
              </select>
            </div>

            {sortedIdeas.length > 0 ? (
              <div className="space-y-3 max-w-2xl">
                {sortedIdeas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    userName={userName || ""}
                    onUpvote={() => mutateIdeas()}
                    onSchedule={() => setScheduleIdea(idea)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-slate-400 text-lg">No ideas proposed yet.</p>
                <p className="text-slate-400 text-sm mt-1">Be the first to suggest a topic!</p>
              </div>
            )}
          </div>
        )}

        {/* My Sessions Tab */}
        {tab === "mine" && userName && (
          <div className="max-w-2xl">
            <p className="text-sm text-slate-500 mb-6">
              Your schedule at a glance. Tap a session to view details or drop out.
            </p>
            {mySessions.length > 0 ? (
              <div className="space-y-4">
                {SLOTS.map((slot) => {
                  const slotSessions = mySessions.filter((s) => getSlot(s.start_time) === slot.id);
                  const hasConflict = slotSessions.length > 1;
                  return (
                    <div key={slot.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-semibold text-slate-800">Slot {slot.id}</h3>
                        <span className="text-sm text-slate-500">{slot.label}</span>
                        {hasConflict && (
                          <span className="badge bg-amber-100 text-amber-800 text-[10px]">
                            conflict — {slotSessions.length} sessions
                          </span>
                        )}
                      </div>
                      {slotSessions.length > 0 ? (
                        <div className="space-y-2">
                          {slotSessions.map((s) => (
                            <SessionCard key={s.id} session={s} allSessions={allSessions} userName={userName || undefined} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic pl-1">No session</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-slate-400 text-lg">You haven&apos;t signed up for any sessions yet.</p>
                <p className="text-slate-400 text-sm mt-1">
                  Browse the <button onClick={() => setTab("schedule")} className="text-navy-600 hover:text-navy-800 underline">schedule</button> and tap a session to attend.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {addSessionBlock && userName && (
        <AddSessionModal
          block={addSessionBlock}
          onClose={() => setAddSessionBlock(null)}
          userName={userName}
          onCreated={() => mutateSessions()}
        />
      )}
      {showProposeIdea && userName && (
        <ProposeIdeaModal
          onClose={() => setShowProposeIdea(false)}
          userName={userName}
          onCreated={() => mutateIdeas()}
        />
      )}
      {scheduleIdea && userName && (
        <ScheduleIdeaModal
          idea={scheduleIdea}
          onClose={() => setScheduleIdea(null)}
          userName={userName}
          onScheduled={() => {
            mutateSessions();
            mutateIdeas();
          }}
        />
      )}
    </>
  );
}
