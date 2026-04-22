"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { marked } from "marked";

interface Logistics {
  id: number;
  content: string;
  updated_at: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

marked.setOptions({ gfm: true, breaks: true });

function RestaurantsCard() {
  return (
    <Link
      href="/restaurants"
      className="card p-5 hover:shadow-md transition-shadow group flex items-center justify-between gap-4 my-6"
    >
      <div>
        <h3 className="font-semibold text-navy-800 group-hover:text-navy-600 transition-colors">
          Restaurant recommendations
        </h3>
      </div>
      <svg className="w-5 h-5 text-slate-400 group-hover:text-navy-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function LogisticsContent({ content }: { content: string }) {
  const parts = content.split(/\{\{\s*restaurants\s*\}\}/);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part.trim() && (
            <div
              className="prose-custom"
              dangerouslySetInnerHTML={{ __html: marked.parse(part) as string }}
            />
          )}
          {i < parts.length - 1 && <RestaurantsCard />}
        </span>
      ))}
    </>
  );
}

export default function LogisticsPage() {
  const { data: logistics, mutate } = useSWR<Logistics>("/api/logistics", fetcher, {
    refreshInterval: 5000,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);

  function startEdit() {
    const stored = localStorage.getItem("admin_password");
    if (stored) {
      setDraft(logistics?.content || "");
      setEditing(true);
    } else {
      setPasswordInput("");
      setPasswordError("");
      setShowPasswordPrompt(true);
    }
  }

  async function handleSave() {
    const password = localStorage.getItem("admin_password");
    if (!password) {
      setShowPasswordPrompt(true);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/logistics", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ content: draft }),
    });
    setSaving(false);
    if (res.status === 401) {
      localStorage.removeItem("admin_password");
      setPasswordError("Password incorrect. Try again.");
      setPasswordInput("");
      setShowPasswordPrompt(true);
      return;
    }
    setEditing(false);
    mutate();
  }

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
      setPasswordError(`Server error (${res.status}). Try again in a moment.`);
      return;
    }
    localStorage.setItem("admin_password", pwd);
    setShowPasswordPrompt(false);
    setDraft(logistics?.content || "");
    setEditing(true);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>

      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 tracking-tight">Logistics</h1>
          <p className="text-slate-500 mt-1">Montreal Offsite &middot; what you need to know</p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="btn-ghost text-sm">
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        logistics?.content ? (
          <LogisticsContent content={logistics.content} />
        ) : (
          <p className="text-slate-400 italic">No logistics info yet.</p>
        )
      ) : (
        <div>
          <textarea
            className="input min-h-[400px] font-mono text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="# Heading&#10;&#10;**Bold**, *italic*, [link](https://...)&#10;&#10;- bullet 1&#10;- bullet 2"
          />
          <p className="text-xs text-slate-400 mt-2">
            Markdown supported: headings (#), bold (**), italic (*), lists (-), links ([text](url)),
            tables (| col | col |), and collapsible sections (&lt;details&gt;&lt;summary&gt;Title&lt;/summary&gt; ... &lt;/details&gt;).
            Add <code className="bg-slate-100 px-1 py-0.5 rounded">{"{{restaurants}}"}</code> on its own line to embed the restaurant recommendations card wherever you want.
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showPasswordPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
          <div className="card p-8 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-navy-800 mb-2">Admin password</h2>
            <p className="text-slate-500 text-sm mb-4">Only the admin can edit logistics.</p>
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
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={!passwordInput.trim() || verifying}>
                  {verifying ? "Checking..." : "Unlock"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasswordPrompt(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
