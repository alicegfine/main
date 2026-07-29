"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "I've handled this one." Logs a lightweight interaction dated now, which
 * runs the normal restart path: cadence timer resets, any queued "reach out
 * now" date is dropped, and scheduled/snooze flags clear.
 */
export function ReachedOutButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markReachedOut() {
    setBusy(true);
    try {
      await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          channel: "note",
          summary: "Reached out",
        }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={markReachedOut}
      disabled={busy}
      title="Mark as reached out — restarts their cadence from today"
      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {busy ? "…" : "✓ reached out"}
    </button>
  );
}
