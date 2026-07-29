"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ContactRowActions({
  contactId,
  isCoworker,
  archived,
}: {
  contactId: string;
  isCoworker: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        onClick={() => patch({ isCoworker: !isCoworker })}
        disabled={busy}
        title={
          isCoworker
            ? "Marked as coworker (excluded from networking views) — click to unmark"
            : "Mark as coworker (excludes them from networking views)"
        }
        className={
          isCoworker
            ? "rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            : "rounded-full border border-slate-300 px-2 py-0.5 text-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:text-slate-200"
        }
      >
        🏢 coworker
      </button>
      <button
        onClick={() => patch({ archived: !archived })}
        disabled={busy}
        title={archived ? "Restore from archive" : "Archive (hides them everywhere)"}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        {archived ? "Restore" : "Archive"}
      </button>
    </span>
  );
}
