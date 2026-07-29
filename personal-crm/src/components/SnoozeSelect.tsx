"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

/**
 * "I don't want to reach out right now, and don't bother me about it":
 * pauses reminders for a fixed window. Any logged interaction clears it.
 */
export function SnoozeSelect({
  contactId,
  snoozed,
}: {
  contactId: string;
  snoozed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function snooze(days: number) {
    setBusy(true);
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeDays: days }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value=""
      disabled={busy}
      onChange={(e) => {
        if (e.target.value !== "") void snooze(Number(e.target.value));
      }}
      title={
        snoozed
          ? "Snoozed — pick a new window or unsnooze"
          : "Snooze: stop reminding me about this person for a while"
      }
      className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-500 shadow-sm focus:border-accent focus:outline-none dark:border-slate-700 dark:bg-slate-900"
    >
      <option value="" disabled>
        ⏰ snooze
      </option>
      {OPTIONS.map((o) => (
        <option key={o.days} value={o.days}>
          {o.label}
        </option>
      ))}
      {snoozed && <option value="0">unsnooze now</option>}
    </select>
  );
}
