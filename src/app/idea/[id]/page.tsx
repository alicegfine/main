"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface IdeaDetail {
  id: number;
  title: string;
  description: string;
  proposed_by: string;
  created_at: string;
  upvotes: number;
  upvoters: string[];
  comments: { id: number; user_name: string; text: string; created_at: string }[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDateTime(dt: string): string {
  const d = new Date(dt + "Z");
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function IdeaPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", proposed_by: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: idea, mutate } = useSWR<IdeaDetail>(`/api/ideas/${id}`, fetcher, {
    refreshInterval: 3000,
  });

  useEffect(() => {
    const stored = localStorage.getItem("unconference_name");
    if (stored) setUserName(stored);
  }, []);

  useEffect(() => {
    if (idea && !editing && !("error" in idea)) {
      setEditForm({
        title: idea.title,
        description: idea.description,
        proposed_by: idea.proposed_by,
      });
    }
  }, [idea, editing]);

  if (!idea) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if ("error" in idea) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Idea not found.</p>
        <Link href="/" className="text-navy-600 hover:text-navy-800 mt-4 inline-block">&larr; Back to ideas</Link>
      </div>
    );
  }

  const hasUpvoted = userName ? idea.upvoters.includes(userName) : false;

  async function handleUpvote() {
    if (!userName) return;
    await fetch(`/api/ideas/${id}/upvote`, {
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
    await fetch(`/api/ideas/${id}/comments`, {
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
    await fetch(`/api/ideas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditing(false);
    mutate();
  }

  async function handleDelete() {
    await fetch(`/api/ideas/${id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to ideas
      </Link>

      {!editing ? (
        <>
          {/* Idea Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge bg-amber-100 text-amber-800">Idea</span>
              <span className="text-xs text-slate-400">{formatDateTime(idea.created_at)}</span>
            </div>
            <h1 className="text-3xl font-bold text-navy-900 tracking-tight mb-2">{idea.title}</h1>
            <p className="text-lg text-slate-600">Proposed by {idea.proposed_by}</p>
            {idea.description && (
              <p className="text-slate-600 mt-4 leading-relaxed">{idea.description}</p>
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
              {idea.upvotes} {idea.upvotes === 1 ? "upvote" : "upvotes"}
            </button>

            {userName && (
              <>
                <button onClick={() => setEditing(true)} className="btn-ghost text-sm">
                  Edit
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm text-slate-400 hover:text-red-600 transition-colors px-3 py-1.5"
                  >
                    Delete
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-red-600">Delete this idea?</span>
                    <button onClick={handleDelete} className="font-medium text-red-600 hover:text-red-800">
                      Yes
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-slate-500 hover:text-slate-700">
                      No
                    </button>
                  </span>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        /* Edit Form */
        <form onSubmit={handleSaveEdit} className="card p-6 mb-8 space-y-4">
          <h2 className="text-lg font-bold text-navy-800 mb-2">Edit Idea</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description <span className="text-slate-400">(optional)</span>
            </label>
            <textarea className="input min-h-[80px]" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Proposed by</label>
            <input className="input" value={editForm.proposed_by} onChange={(e) => setEditForm({ ...editForm, proposed_by: e.target.value })} required />
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
      <div>
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">
          Comments ({idea.comments.length})
        </h2>

        {idea.comments.length === 0 && (
          <p className="text-sm text-slate-400 italic mb-4">No comments yet.</p>
        )}

        <div className="space-y-4 mb-6">
          {idea.comments.map((c) => (
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
    </div>
  );
}
