"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/status";

const field =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-700 dark:bg-slate-900";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogInteractionForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState("linkedin");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, channel, summary, occurredAt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to log");
        return;
      }
      setSummary("");
      setOccurredAt(today());
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <select className={field} value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNELS.filter((c) => c !== "granola").map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={field}
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </div>
      <textarea
        className={`${field} min-h-20 w-full`}
        placeholder="What did you talk about? (optional)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Logging…" : "Log interaction"}
      </button>
    </form>
  );
}
