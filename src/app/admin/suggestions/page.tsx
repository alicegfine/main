"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Suggestion {
  id: number;
  text: string;
  user_name: string | null;
  is_anonymous: boolean;
  page_path: string;
  created_at: string;
}

function formatDateTime(dt: string): string {
  const d = new Date(dt + "Z");
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminSuggestionsPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (pwd: string) => {
    setLoading(true);
    const res = await fetch("/api/suggestions", {
      headers: { "x-admin-password": pwd },
    });
    setLoading(false);
    if (res.status === 401) {
      localStorage.removeItem("admin_password");
      setPassword(null);
      setPasswordError("Password incorrect. Try again.");
      return;
    }
    if (!res.ok) {
      setPasswordError(`Server error (${res.status}).`);
      return;
    }
    const data = await res.json();
    setSuggestions(data);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("admin_password");
    if (stored) {
      setPassword(stored);
      load(stored);
    }
  }, [load]);

  async function handleSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    const pwd = passwordInput.trim();
    if (!pwd) return;
    setVerifying(true);
    setPasswordError("");
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "x-admin-password": pwd },
    });
    setVerifying(false);
    if (res.status === 401) {
      setPasswordError("Password incorrect.");
      setPasswordInput("");
      return;
    }
    if (!res.ok) {
      setPasswordError(`Server error (${res.status}).`);
      return;
    }
    localStorage.setItem("admin_password", pwd);
    setPassword(pwd);
    setPasswordInput("");
    load(pwd);
  }

  async function handleDelete(id: number) {
    if (!password) return;
    await fetch(`/api/suggestions/${id}`, {
      method: "DELETE",
      headers: { "x-admin-password": password },
    });
    setSuggestions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  }

  if (!password) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <Link
          href="/"
          className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>
        <div className="card p-6">
          <h1 className="text-xl font-bold text-navy-800 mb-2">Suggestions</h1>
          <p className="text-sm text-slate-500 mb-4">Admin password required.</p>
          <form onSubmit={handleSubmitPassword}>
            <input
              type="password"
              className="input mb-3"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-red-600 mb-3">{passwordError}</p>
            )}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={!passwordInput.trim() || verifying}
            >
              {verifying ? "Checking..." : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/"
        className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 tracking-tight">Suggestions</h1>
          <p className="text-slate-500 mt-1">
            {suggestions ? `${suggestions.length} total` : ""}
          </p>
        </div>
        <button
          onClick={() => password && load(password)}
          className="btn-ghost text-sm"
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {suggestions === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No suggestions yet.</p>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 whitespace-pre-wrap">{s.text}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    <span className={s.is_anonymous ? "italic text-slate-400" : "font-medium text-navy-700"}>
                      {s.is_anonymous ? "Anonymous" : s.user_name || "Unknown"}
                    </span>
                    <span>&middot;</span>
                    <span>{formatDateTime(s.created_at)}</span>
                    {s.page_path && (
                      <>
                        <span>&middot;</span>
                        <span className="text-slate-400">from {s.page_path}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-xs text-slate-400 hover:text-red-600 transition-colors shrink-0"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
