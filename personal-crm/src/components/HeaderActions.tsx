"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HeaderActions() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function syncNow() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Sync failed");
      } else {
        const more = data.capped ? " (more remain — sync again)" : "";
        let ai = "";
        if (data.extractionEnabled === false) ai = " · AI suggestions off (no ANTHROPIC_API_KEY)";
        else if (data.extractionFailures > 0)
          ai = ` · ${data.extractionFailures} AI call(s) failed — check key/credits`;
        else if (data.extractionPending > 0)
          ai = ` · ${data.extractionPending} note(s) awaiting AI — sync again`;
        setMsg(
          `Synced ${data.notesProcessed} note(s): ${data.contactsCreated} new contact(s), ${data.suggestionsCreated} suggestion(s)${more}${ai}`,
        );
        router.refresh();
      }
    } catch {
      setMsg("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {msg && <span className="hidden text-xs text-slate-500 sm:inline">{msg}</span>}
      <button
        onClick={syncNow}
        disabled={syncing}
        className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {syncing ? "Syncing…" : "Sync Granola"}
      </button>
      <button
        onClick={logout}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        Log out
      </button>
    </div>
  );
}
