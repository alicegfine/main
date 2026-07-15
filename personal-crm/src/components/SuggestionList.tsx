"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Suggestion } from "@prisma/client";

export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "accept" | "dismiss") {
    setBusy(id);
    try {
      await fetch(`/api/suggestions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

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
        <li key={s.id} className="flex items-start justify-between gap-3 px-1 py-2.5">
          <div className="min-w-0">
            <div className="font-medium">{s.name}</div>
            {s.reason && <div className="text-xs text-slate-500">{s.reason}</div>}
            {s.sourceNoteTitle && (
              <div className="text-xs text-slate-400">
                from “{s.sourceNoteTitle}”
                {s.sourceUrl && (
                  <>
                    {" · "}
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      note ↗
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => act(s.id, "accept")}
              disabled={busy === s.id}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => act(s.id, "dismiss")}
              disabled={busy === s.id}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
