"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SuggestionCandidate {
  id: string;
  name: string;
  company: string | null;
  isCoworker: boolean;
}

export interface SuggestionView {
  id: string;
  name: string;
  reason: string | null;
  context: string | null;
  sourceNoteTitle: string | null;
  sourceUrl: string | null;
  /** Set when confidently matched to one existing contact. */
  linked: SuggestionCandidate | null;
  /** Ambiguous matches — the user picks (their pick is remembered). */
  candidates: SuggestionCandidate[];
}

function Row({ s }: { s: SuggestionView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(s.name);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/suggestions/${s.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-1.5 px-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {s.linked ? (
          <span className="font-medium">
            {s.linked.name}
            <span className="ml-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent dark:bg-slate-800 dark:text-slate-200">
              existing contact{s.linked.company ? ` · ${s.linked.company}` : ""}
            </span>
          </span>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            title="Fix the spelling before adding — Granola often mangles names"
            className="w-44 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium shadow-sm focus:border-accent focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          />
        )}
        {s.reason && <span className="text-xs text-slate-500">{s.reason}</span>}
      </div>

      {s.context && (
        <blockquote className="border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500 dark:border-slate-700">
          “{s.context}”
        </blockquote>
      )}

      {s.sourceNoteTitle && (
        <div className="text-xs text-slate-400">
          from “{s.sourceNoteTitle}”
          {s.sourceUrl && (
            <>
              {" · "}
              <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                open note ↗
              </a>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {s.candidates.length > 0 && (
          <>
            <span className="text-xs text-slate-400">Same person as</span>
            {s.candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => act({ action: "resolve", contactId: c.id })}
                disabled={busy}
                title={
                  c.isCoworker
                    ? "Coworker — resolving dismisses this and skips future mentions of this name"
                    : `Queue ${c.name} to reach out — remembered for future mentions`
                }
                className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {c.name}
                {c.company ? ` (${c.company})` : ""}
                {c.isCoworker ? " 🏢" : ""}
              </button>
            ))}
            <span className="text-xs text-slate-400">or</span>
          </>
        )}
        <button
          onClick={() => act(s.linked ? { action: "accept" } : { action: "accept", name })}
          disabled={busy}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {s.linked ? "Queue" : s.candidates.length > 0 ? "New person" : "Add"}
        </button>
        <button
          onClick={() => act({ action: "dismiss" })}
          disabled={busy}
          className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

export function SuggestionList({ suggestions }: { suggestions: SuggestionView[] }) {
  if (suggestions.length === 0) {
    return (
      <p className="px-1 py-3 text-sm text-slate-400">
        No suggestions right now. They appear here after a Granola sync.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {suggestions.map((s) => (
        <Row key={s.id} s={s} />
      ))}
    </ul>
  );
}
