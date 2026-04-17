"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";

const TEAMS = [
  { id: "exec", name: "Exec" },
  { id: "ppe", name: "PPE" },
  { id: "be", name: "BE" },
  { id: "comms", name: "Comms" },
  { id: "gov", name: "Gov" },
  { id: "ops", name: "Ops" },
];

interface Question {
  id: number;
  team: string;
  text: string;
  user_name: string | null;
  is_anonymous: boolean;
  upvotes: number;
  upvoters: string[];
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDateTime(dt: string): string {
  const d = new Date(dt + "Z");
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

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

function AskQuestionForm({
  team,
  userName,
  onSubmitted,
}: {
  team: string;
  userName: string;
  onSubmitted: () => void;
}) {
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team,
        text: text.trim(),
        user_name: userName,
        is_anonymous: anon,
      }),
    });
    setText("");
    setAnon(false);
    setSubmitting(false);
    onSubmitted();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 mb-6">
      <textarea
        className="input min-h-[80px]"
        placeholder={`Ask a question for ${TEAMS.find((t) => t.id === team)?.name}...`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-slate-300"
            checked={anon}
            onChange={(e) => setAnon(e.target.checked)}
          />
          Post anonymously
        </label>
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={submitting || !text.trim()}
        >
          {submitting ? "Submitting..." : "Submit question"}
        </button>
      </div>
    </form>
  );
}

function QuestionCard({
  question,
  userName,
  onUpdate,
}: {
  question: Question;
  userName: string;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(question.text);
  const [editAnon, setEditAnon] = useState(question.is_anonymous);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voting, setVoting] = useState(false);

  const hasUpvoted = userName ? question.upvoters.includes(userName) : false;
  const author = question.is_anonymous ? "Anonymous" : question.user_name || "Anonymous";

  async function handleUpvote() {
    if (!userName || voting) return;
    setVoting(true);
    await fetch(`/api/questions/${question.id}/upvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName }),
    });
    onUpdate();
    setVoting(false);
  }

  async function handleSave() {
    if (!editText.trim()) return;
    await fetch(`/api/questions/${question.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText.trim(), is_anonymous: editAnon }),
    });
    setEditing(false);
    onUpdate();
  }

  async function handleDelete() {
    await fetch(`/api/questions/${question.id}`, { method: "DELETE" });
    onUpdate();
  }

  function startEdit() {
    setEditText(question.text);
    setEditAnon(question.is_anonymous);
    setEditing(true);
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={handleUpvote}
          disabled={!userName || voting}
          className={`flex flex-col items-center pt-0.5 transition-colors shrink-0 ${
            hasUpvoted ? "text-navy-600" : "text-slate-400 hover:text-navy-600"
          }`}
        >
          <svg className="w-5 h-5" fill={hasUpvoted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-sm font-semibold">{question.upvotes}</span>
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div>
              <textarea
                className="input min-h-[60px]"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
              />
              <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300"
                    checked={editAnon}
                    onChange={(e) => setEditAnon(e.target.checked)}
                  />
                  Anonymous
                </label>
                <div className="flex gap-2">
                  <button onClick={handleSave} className="btn-primary text-sm" disabled={!editText.trim()}>
                    Save
                  </button>
                  <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-slate-800 whitespace-pre-wrap">{question.text}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`text-xs ${question.is_anonymous ? "text-slate-400 italic" : "text-slate-500"}`}>
                  {author}
                </span>
                <span className="text-xs text-slate-400">{formatDateTime(question.created_at)}</span>
                {userName && (
                  <>
                    <button
                      onClick={startEdit}
                      className="text-xs text-slate-400 hover:text-navy-700"
                    >
                      Edit
                    </button>
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    ) : (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-red-600">Delete?</span>
                        <button
                          onClick={handleDelete}
                          className="font-medium text-red-600 hover:text-red-800"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="text-slate-500 hover:text-slate-700"
                        >
                          No
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AMAPage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeTeam, setActiveTeam] = useState(TEAMS[0].id);
  const [sort, setSort] = useState<"upvotes" | "newest">("upvotes");

  const { data: allQuestions, mutate } = useSWR<Question[]>("/api/questions", fetcher, {
    refreshInterval: 3000,
  });

  useEffect(() => {
    const stored = localStorage.getItem("sut_name") || localStorage.getItem("unconference_name");
    if (stored) setUserName(stored);
    setLoaded(true);
  }, []);

  const handleSetName = useCallback((name: string) => {
    localStorage.setItem("sut_name", name);
    setUserName(name);
  }, []);

  if (!loaded) return null;

  const all = allQuestions || [];
  const teamCounts: Record<string, number> = {};
  for (const t of TEAMS) teamCounts[t.id] = 0;
  for (const q of all) teamCounts[q.team] = (teamCounts[q.team] || 0) + 1;

  const teamQuestions = all.filter((q) => q.team === activeTeam);
  const sorted = [...teamQuestions].sort((a, b) => {
    if (sort === "upvotes") {
      if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
      return b.id - a.id;
    }
    return b.id - a.id;
  });

  return (
    <>
      {!userName && <NamePrompt onSet={handleSetName} />}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-navy-900 tracking-tight">AMA</h1>
            <p className="text-slate-500 mt-1">Montreal Offsite &middot; Day 1 &middot; answered live</p>
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

        {/* Team tabs */}
        <div className="border-b border-slate-200 mb-6">
          <nav className="flex gap-6 overflow-x-auto">
            {TEAMS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTeam(t.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTeam === t.id
                    ? "border-navy-700 text-navy-800"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.name}
                {teamCounts[t.id] > 0 && (
                  <span className="ml-2 badge bg-navy-100 text-navy-700">{teamCounts[t.id]}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Ask form */}
        {userName && (
          <AskQuestionForm team={activeTeam} userName={userName} onSubmitted={mutate} />
        )}

        {/* Sort */}
        {sorted.length > 0 && (
          <div className="flex items-center justify-end mb-4">
            <select
              className="text-sm border border-slate-300 rounded-md px-3 py-1.5 text-slate-600"
              value={sort}
              onChange={(e) => setSort(e.target.value as "upvotes" | "newest")}
            >
              <option value="upvotes">Most upvoted</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        )}

        {/* Questions */}
        {sorted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400 text-lg">No questions yet.</p>
            <p className="text-slate-400 text-sm mt-1">Be the first to ask!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                userName={userName || ""}
                onUpdate={mutate}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
