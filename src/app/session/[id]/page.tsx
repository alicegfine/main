"use client";

import { useState, useEffect, use } from "react";
import useSWR from "swr";
import Link from "next/link";

const ROOMS = ["Anderson A", "Anderson B", "Bleury", "Walking/Lobby"];
const ROOM_COLORS: Record<string, string> = {
  "Anderson A": "bg-blue-100 text-blue-800",
  "Anderson B": "bg-emerald-100 text-emerald-800",
  Bleury: "bg-violet-100 text-violet-800",
  "Walking/Lobby": "bg-amber-100 text-amber-800",
};

interface SessionDetail {
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
  upvotes: number;
  upvoters: string[];
  attendees: string[];
  comments: { id: number; user_name: string; text: string; created_at: string }[];
  edit_logs: { id: number; edited_by: string; changes: string; created_at: string }[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${nh}:${nm.toString().padStart(2, "0")}`;
}

function formatDateTime(dt: string): string {
  const d = new Date(dt + "Z");
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [userName, setUserName] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", speaker: "", room: "", start_time: "", duration_minutes: 30 });
  const [showEditLog, setShowEditLog] = useState(false);

  const { data: session, mutate } = useSWR<SessionDetail>(`/api/sessions/${id}`, fetcher, {
    refreshInterval: 3000,
  });

  useEffect(() => {
    const stored = localStorage.getItem("unconference_name");
    if (stored) setUserName(stored);
  }, []);

  useEffect(() => {
    if (session && !editing) {
      setEditForm({
        title: session.title,
        description: session.description,
        speaker: session.speaker,
        room: session.room,
        start_time: session.start_time,
        duration_minutes: session.duration_minutes,
      });
    }
  }, [session, editing]);

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if ("error" in session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Session not found.</p>
        <Link href="/" className="text-navy-600 hover:text-navy-800 mt-4 inline-block">&larr; Back to schedule</Link>
      </div>
    );
  }

  const endTime = addMinutes(session.start_time, session.duration_minutes);
  const hasUpvoted = userName ? session.upvoters.includes(userName) : false;
  const isAttending = userName ? session.attendees.includes(userName) : false;

  async function handleUpvote() {
    if (!userName) return;
    await fetch(`/api/sessions/${id}/upvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName }),
    });
    mutate();
  }

  async function handleAttend() {
    if (!userName) return;
    await fetch(`/api/sessions/${id}/attend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName }),
    });
    mutate();
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!userName || !commentText.trim()) return;
    setSubmittingComment(true);
    await fetch(`/api/sessions/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName, text: commentText.trim() }),
    });
    setCommentText("");
    setSubmittingComment(false);
    mutate();
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!userName) return;
    await fetch(`/api/sessions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, edited_by: userName }),
    });
    setEditing(false);
    mutate();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to schedule
      </Link>

      {!editing ? (
        <>
          {/* Session Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <span className={`badge ${ROOM_COLORS[session.room] || "bg-slate-100 text-slate-800"}`}>
                {session.room}
              </span>
              <span className="text-sm text-slate-500">
                {formatTime(session.start_time)} &ndash; {formatTime(endTime)}
              </span>
              <span className="text-sm text-slate-400">({session.duration_minutes} min)</span>
            </div>
            <h1 className="text-3xl font-bold text-navy-900 tracking-tight mb-2">{session.title}</h1>
            <p className="text-lg text-slate-600">{session.speaker}</p>
            {session.description && (
              <p className="text-slate-600 mt-4 leading-relaxed">{session.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button
              onClick={handleUpvote}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border font-medium text-sm transition-colors ${
                hasUpvoted
                  ? "bg-navy-50 border-navy-300 text-navy-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg className="w-4 h-4" fill={hasUpvoted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
              </svg>
              {session.upvotes} {session.upvotes === 1 ? "upvote" : "upvotes"}
            </button>

            <button
              onClick={handleAttend}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border font-medium text-sm transition-colors ${
                isAttending
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isAttending ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                )}
              </svg>
              {isAttending ? "Attending" : "Attend"}
            </button>

            {userName && (
              <button onClick={() => setEditing(true)} className="btn-ghost text-sm">
                Edit
              </button>
            )}
          </div>

          {/* Attendees */}
          {session.attendees.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-3">
                Attending ({session.attendees.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {session.attendees.map((name) => (
                  <span key={name} className="badge bg-slate-100 text-slate-700">{name}</span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Edit Form */
        <form onSubmit={handleSaveEdit} className="card p-6 mb-8 space-y-4">
          <h2 className="text-lg font-bold text-navy-800 mb-2">Edit Session</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea className="input min-h-[80px]" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Speaker</label>
            <input className="input" value={editForm.speaker} onChange={(e) => setEditForm({ ...editForm, speaker: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Room</label>
            <select className="input" value={editForm.room} onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}>
              {ROOMS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start time</label>
              <input type="time" className="input" value={editForm.start_time} onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
              <select className="input" value={editForm.duration_minutes} onChange={(e) => setEditForm({ ...editForm, duration_minutes: Number(e.target.value) })}>
                {[10, 15, 20, 30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary">Save Changes</button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Divider */}
      <div className="border-t border-slate-200 my-8" />

      {/* Comments */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">
          Comments ({session.comments.length})
        </h2>

        {session.comments.length === 0 && (
          <p className="text-sm text-slate-400 italic mb-4">No comments yet.</p>
        )}

        <div className="space-y-4 mb-6">
          {session.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-navy-100 text-navy-700 flex items-center justify-center text-xs font-bold shrink-0">
                {c.user_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-navy-800">{c.user_name}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">{c.text}</p>
              </div>
            </div>
          ))}
        </div>

        {userName && (
          <form onSubmit={handleComment} className="flex gap-3">
            <input
              className="input flex-1"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary shrink-0"
              disabled={submittingComment || !commentText.trim()}
            >
              Send
            </button>
          </form>
        )}
      </div>

      {/* Edit Log */}
      {session.edit_logs.length > 0 && (
        <div>
          <button
            onClick={() => setShowEditLog(!showEditLog)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
          >
            Edit Log ({session.edit_logs.length})
            <svg
              className={`w-4 h-4 transition-transform ${showEditLog ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showEditLog && (
            <div className="mt-3 space-y-3">
              {session.edit_logs.map((log) => {
                const changes = JSON.parse(log.changes);
                return (
                  <div key={log.id} className="text-sm border-l-2 border-slate-200 pl-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-700">{log.edited_by}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                    </div>
                    <ul className="mt-1 text-slate-500">
                      {Object.entries(changes).map(([field, change]) => {
                        const c = change as { from: any; to: any };
                        return (
                          <li key={field}>
                            Changed <span className="font-medium">{field}</span> from &ldquo;{String(c.from)}&rdquo; to &ldquo;{String(c.to)}&rdquo;
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
