"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";

interface AgendaItem {
  time: string;
  activity: string;
  description: string;
  location: string;
  facilitator: string;
}

interface AgendaDay {
  day: string;
  items: AgendaItem[];
}

interface AgendaData {
  content: AgendaDay[];
  updated_at: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AgendaPage() {
  const { data: agenda, mutate } = useSWR<AgendaData>("/api/agenda", fetcher, {
    refreshInterval: 5000,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AgendaDay[]>([]);
  const [collapsedDays, setCollapsedDays] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);

  function startEdit() {
    const stored = localStorage.getItem("admin_password");
    if (stored) {
      setDraft(JSON.parse(JSON.stringify(agenda?.content || [])));
      setEditing(true);
    } else {
      setPasswordInput("");
      setPasswordError("");
      setShowPasswordPrompt(true);
    }
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
    setDraft(JSON.parse(JSON.stringify(agenda?.content || [])));
    setEditing(true);
  }

  async function handleSave() {
    const password = localStorage.getItem("admin_password");
    if (!password) {
      setShowPasswordPrompt(true);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/agenda", {
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
      setPasswordError("Password incorrect.");
      setPasswordInput("");
      setShowPasswordPrompt(true);
      return;
    }
    setEditing(false);
    mutate();
  }

  function updateDay(dayIdx: number, field: string, value: string) {
    const next = [...draft];
    next[dayIdx] = { ...next[dayIdx], [field]: value };
    setDraft(next);
  }

  function updateItem(dayIdx: number, itemIdx: number, field: string, value: string) {
    const next = [...draft];
    const items = [...next[dayIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: value };
    next[dayIdx] = { ...next[dayIdx], items };
    setDraft(next);
  }

  function addItem(dayIdx: number) {
    const next = [...draft];
    next[dayIdx] = {
      ...next[dayIdx],
      items: [...next[dayIdx].items, { time: "", activity: "", description: "", location: "", facilitator: "" }],
    };
    setDraft(next);
  }

  function removeItem(dayIdx: number, itemIdx: number) {
    const next = [...draft];
    next[dayIdx] = {
      ...next[dayIdx],
      items: next[dayIdx].items.filter((_, i) => i !== itemIdx),
    };
    setDraft(next);
  }

  function addDay(atIdx: number) {
    const next = [...draft];
    next.splice(atIdx, 0, { day: `Day ${draft.length + 1}`, items: [] });
    setDraft(next);
  }

  function removeDay(dayIdx: number) {
    setDraft(draft.filter((_, i) => i !== dayIdx));
  }

  const days = editing ? draft : agenda?.content || [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>

      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 tracking-tight">Agenda</h1>
          <p className="text-slate-500 mt-1">Montreal Offsite</p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="btn-ghost text-sm">
            Edit
          </button>
        )}
      </div>

      {days.length === 0 && !editing && (
        <p className="text-slate-400 italic">No agenda items yet.</p>
      )}

      {days.length === 0 && editing && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => addDay(0)}
            className="text-sm text-navy-600 hover:text-navy-800 font-medium inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add day
          </button>
        </div>
      )}

      <div className="space-y-8">
        {days.map((day, dayIdx) => (
          <div key={dayIdx}>
            {editing && dayIdx === 0 && (
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => addDay(0)}
                  className="text-xs text-slate-400 hover:text-navy-600 font-medium inline-flex items-center gap-1 border border-dashed border-slate-300 hover:border-navy-400 rounded-md px-3 py-1.5 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Insert day above
                </button>
              </div>
            )}
            {editing ? (
              <div className="flex items-center gap-3 mb-4">
                <input
                  className="input max-w-xs font-bold text-lg"
                  value={day.day}
                  onChange={(e) => updateDay(dayIdx, "day", e.target.value)}
                  placeholder="Day name"
                />
                {draft.length > 1 && (
                  <button
                    onClick={() => removeDay(dayIdx)}
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    Remove day
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setCollapsedDays((prev) => ({ ...prev, [dayIdx]: !prev[dayIdx] }))}
                className="flex items-center gap-2 mb-4 group text-left w-full sm:w-auto"
              >
                <svg
                  className={`w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-transform sm:order-last ${collapsedDays[dayIdx] ? "-rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <h2 className="text-xl font-bold text-navy-800">{day.day}</h2>
              </button>
            )}

            {!collapsedDays[dayIdx] && (day.items.length > 0 || editing) ? (
              <>
                {/* Mobile: stacked cards */}
                <div className="sm:hidden space-y-3">
                  {day.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="card p-4">
                      {editing ? (
                        <div className="space-y-2">
                          <input
                            className="input text-sm"
                            value={item.time}
                            onChange={(e) => updateItem(dayIdx, itemIdx, "time", e.target.value)}
                            placeholder="e.g. 9:00 AM"
                          />
                          <input
                            className="input text-sm"
                            value={item.activity}
                            onChange={(e) => updateItem(dayIdx, itemIdx, "activity", e.target.value)}
                            placeholder="Title"
                          />
                          <input
                            className="input text-sm"
                            value={item.description || ""}
                            onChange={(e) => updateItem(dayIdx, itemIdx, "description", e.target.value)}
                            placeholder="Description (optional)"
                          />
                          <input
                            className="input text-sm"
                            value={item.location || ""}
                            onChange={(e) => updateItem(dayIdx, itemIdx, "location", e.target.value)}
                            placeholder="Location"
                          />
                          <input
                            className="input text-sm"
                            value={item.facilitator || ""}
                            onChange={(e) => updateItem(dayIdx, itemIdx, "facilitator", e.target.value)}
                            placeholder="Facilitator (optional)"
                          />
                          <button
                            onClick={() => removeItem(dayIdx, itemIdx)}
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-sm font-semibold text-navy-700">{item.time}</span>
                            {item.location && (
                              <span className="text-xs text-slate-400">{item.location}</span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-800">{item.activity}</span>
                          {item.description && (
                            <p className="text-sm text-slate-500 mt-0.5">{item.description}</p>
                          )}
                          {item.facilitator && (
                            <p className="text-xs text-slate-400 mt-0.5">Facilitator: {item.facilitator}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {editing && (
                    <button
                      onClick={() => addItem(dayIdx)}
                      className="text-sm text-navy-600 hover:text-navy-800 font-medium inline-flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add row
                    </button>
                  )}
                </div>

                {/* Desktop: table */}
                <div className="hidden sm:block card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 w-28">
                          Time
                        </th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                          Activity
                        </th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 w-36">
                          Location
                        </th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 w-36">
                          Facilitator
                        </th>
                        {editing && (
                          <th className="w-10" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {day.items.map((item, itemIdx) => (
                        <tr key={itemIdx} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-3 align-top">
                            {editing ? (
                              <input
                                className="input text-sm"
                                value={item.time}
                                onChange={(e) => updateItem(dayIdx, itemIdx, "time", e.target.value)}
                                placeholder="e.g. 9:00 AM"
                              />
                            ) : (
                              <span className="text-sm font-medium text-navy-700 whitespace-nowrap">{item.time}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {editing ? (
                              <div className="space-y-2">
                                <input
                                  className="input text-sm"
                                  value={item.activity}
                                  onChange={(e) => updateItem(dayIdx, itemIdx, "activity", e.target.value)}
                                  placeholder="Title"
                                />
                                <input
                                  className="input text-sm"
                                  value={item.description || ""}
                                  onChange={(e) => updateItem(dayIdx, itemIdx, "description", e.target.value)}
                                  placeholder="Description (optional)"
                                />
                              </div>
                            ) : (
                              <div>
                                <span className="text-sm font-medium text-slate-800">{item.activity}</span>
                                {item.description && (
                                  <p className="text-sm text-slate-500 mt-0.5">{item.description}</p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {editing ? (
                              <input
                                className="input text-sm"
                                value={item.location || ""}
                                onChange={(e) => updateItem(dayIdx, itemIdx, "location", e.target.value)}
                                placeholder="Location"
                              />
                            ) : (
                              item.location && <span className="text-sm text-slate-500">{item.location}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {editing ? (
                              <input
                                className="input text-sm"
                                value={item.facilitator || ""}
                                onChange={(e) => updateItem(dayIdx, itemIdx, "facilitator", e.target.value)}
                                placeholder="Facilitator"
                              />
                            ) : (
                              item.facilitator && <span className="text-sm text-slate-500">{item.facilitator}</span>
                            )}
                          </td>
                          {editing && (
                            <td className="px-2 py-3 align-top">
                              <button
                                onClick={() => removeItem(dayIdx, itemIdx)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                                title="Remove row"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {editing && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3">
                            <button
                              onClick={() => addItem(dayIdx)}
                              className="text-sm text-navy-600 hover:text-navy-800 font-medium inline-flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                              Add row
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : !collapsedDays[dayIdx] ? (
              <p className="text-sm text-slate-400 italic">No items yet.</p>
            ) : null}

            {editing && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => addDay(dayIdx + 1)}
                  className="text-xs text-slate-400 hover:text-navy-600 font-medium inline-flex items-center gap-1 border border-dashed border-slate-300 hover:border-navy-400 rounded-md px-3 py-1.5 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Insert day below
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-8 space-y-4">
          <div className="flex gap-3">
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
            <p className="text-slate-500 text-sm mb-4">Only the admin can edit the agenda.</p>
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
