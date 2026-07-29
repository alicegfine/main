"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CADENCE_OPTIONS } from "@/lib/cadence";

export interface ContactFormValues {
  name: string;
  email: string;
  company: string;
  role: string;
  linkedinUrl: string;
  howMet: string;
  tags: string;
  cadenceDays: string; // "" = no reminders
  notes: string;
  lastContactAt: string; // yyyy-mm-dd or ""
  nextFollowUpAt: string; // yyyy-mm-dd or ""
}

const EMPTY: ContactFormValues = {
  name: "",
  email: "",
  company: "",
  role: "",
  linkedinUrl: "",
  howMet: "",
  tags: "",
  cadenceDays: "30",
  notes: "",
  lastContactAt: "",
  nextFollowUpAt: "",
};

const field =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-700 dark:bg-slate-900";
const label = "block text-xs font-medium text-slate-500 mb-1";

export function ContactForm({
  id,
  initial,
}: {
  id?: string;
  initial?: Partial<ContactFormValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ContactFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ContactFormValues>(key: K, v: ContactFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(id ? `/api/contacts/${id}` : "/api/contacts", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push(`/contacts/${data.contact.id}`);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Name *</label>
          <input
            className={field}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div>
          <label className={label}>Company</label>
          <input className={field} value={values.company} onChange={(e) => set("company", e.target.value)} />
        </div>
        <div>
          <label className={label}>Role</label>
          <input className={field} value={values.role} onChange={(e) => set("role", e.target.value)} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input
            type="email"
            className={field}
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>LinkedIn URL</label>
          <input
            className={field}
            value={values.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </div>
        <div>
          <label className={label}>Contact cadence</label>
          <select
            className={field}
            value={values.cadenceDays}
            onChange={(e) => set("cadenceDays", e.target.value)}
          >
            {CADENCE_OPTIONS.map((o) => (
              <option key={o.label} value={o.days === null ? "" : String(o.days)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Tags (comma-separated)</label>
          <input
            className={field}
            value={values.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="funder, biosecurity, warm intro"
          />
        </div>
        <div>
          <label className={label}>Last contact</label>
          <input
            type="date"
            className={field}
            value={values.lastContactAt}
            onChange={(e) => set("lastContactAt", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Next follow-up</label>
          <input
            type="date"
            className={field}
            value={values.nextFollowUpAt}
            onChange={(e) => set("nextFollowUpAt", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>How you met</label>
          <input className={field} value={values.howMet} onChange={(e) => set("howMet", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Notes</label>
          <textarea
            className={`${field} min-h-24`}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : id ? "Save changes" : "Add contact"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
