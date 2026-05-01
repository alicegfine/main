"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";

interface Attendee {
  user_name: string;
  is_point_person: boolean;
}

interface DinnerPlan {
  id: number;
  day: number;
  restaurant_name: string;
  notes: string;
  created_by: string;
  created_at: string;
  attendees: Attendee[];
}

interface DayConfig {
  day: number;
  label: string;
  fixed?: { title: string; description: string };
}

const DAYS: DayConfig[] = [
  { day: 0, label: "Mon May 4" },
  {
    day: 1,
    label: "Tue May 5 (Day 1)",
    fixed: {
      title: "Team dinner at LOV McGill",
      description:
        "464 Rue McGill, 6 PM. Meet in the lobby at 5:50 PM to walk over together.",
    },
  },
  { day: 2, label: "Wed May 6 (Day 2)" },
  { day: 3, label: "Thu May 7 (Day 3)" },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function NamePrompt({ onSet }: { onSet: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
      <div className="card p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-navy-800 mb-2">Welcome to Montreal Offsite</h2>
        <p className="text-slate-500 mb-6">Enter your name to get started.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSet(name.trim());
          }}
        >
          <input
            className="input mb-4"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary w-full" disabled={!name.trim()}>
            Let&apos;s go
          </button>
        </form>
      </div>
    </div>
  );
}

function AddPlanModal({
  day,
  dateLabel,
  userName,
  onClose,
  onCreated,
}: {
  day: number;
  dateLabel: string;
  userName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [restaurant, setRestaurant] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurant.trim()) return;
    setSubmitting(true);
    await fetch("/api/dinner-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day,
        restaurant_name: restaurant.trim(),
        notes: notes.trim(),
        created_by: userName,
      }),
    });
    setSubmitting(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm p-4">
      <div className="card p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-navy-800">Add a dinner plan</h2>
            <p className="text-sm text-slate-500 mt-0.5">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Restaurant</label>
            <input
              className="input"
              placeholder="Restaurant name"
              value={restaurant}
              onChange={(e) => setRestaurant(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-slate-400 mt-1">
              Need ideas?{" "}
              <Link href="/restaurants" className="text-navy-600 hover:text-navy-800 underline">
                See restaurant suggestions
              </Link>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              className="input min-h-[80px]"
              placeholder="e.g. 7:30pm, meet in lobby at 7:15"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">
            You&apos;ll automatically be added to the plan when you create it.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting || !restaurant.trim()}
            >
              {submitting ? "Creating..." : "Create plan"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  userName,
  allPlans,
  onMutate,
}: {
  plan: DinnerPlan;
  userName: string;
  allPlans: DinnerPlan[];
  onMutate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(plan.restaurant_name);
  const [editNotes, setEditNotes] = useState(plan.notes);
  const [busy, setBusy] = useState(false);

  const isAttending = plan.attendees.some((a) => a.user_name === userName);
  const isPointPerson = plan.attendees.some((a) => a.user_name === userName && a.is_point_person);
  const pointPerson = plan.attendees.find((a) => a.is_point_person);

  async function handleJoin() {
    if (!userName) return;
    // Check for same-day conflict
    const conflict = allPlans.find(
      (p) => p.day === plan.day && p.id !== plan.id && p.attendees.some((a) => a.user_name === userName)
    );
    if (conflict) {
      const proceed = confirm(
        `You're already signed up for ${conflict.restaurant_name} on Day ${plan.day}. Sign up for ${plan.restaurant_name} too?`
      );
      if (!proceed) return;
    }
    setBusy(true);
    await fetch(`/api/dinner-plans/${plan.id}/attendees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", user_name: userName }),
    });
    setBusy(false);
    onMutate();
  }

  async function handleLeave() {
    if (!userName) return;
    setBusy(true);
    await fetch(`/api/dinner-plans/${plan.id}/attendees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", user_name: userName }),
    });
    setBusy(false);
    onMutate();
  }

  async function handleTogglePP() {
    if (!userName) return;
    setBusy(true);
    await fetch(`/api/dinner-plans/${plan.id}/attendees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle-pp", user_name: userName }),
    });
    setBusy(false);
    onMutate();
  }

  async function handleSaveEdit() {
    if (!editName.trim()) return;
    setBusy(true);
    await fetch(`/api/dinner-plans/${plan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_name: editName.trim(),
        notes: editNotes.trim(),
      }),
    });
    setBusy(false);
    setEditing(false);
    onMutate();
  }

  return (
    <div className="card p-5">
      {editing ? (
        <div className="space-y-3">
          <input
            className="input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Restaurant name"
          />
          <textarea
            className="input min-h-[60px]"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Notes (optional)"
          />
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} className="btn-primary text-sm" disabled={busy || !editName.trim()}>
              Save
            </button>
            <button
              onClick={() => {
                setEditName(plan.restaurant_name);
                setEditNotes(plan.notes);
                setEditing(false);
              }}
              className="btn-secondary text-sm"
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-lg font-bold text-navy-900">{plan.restaurant_name}</h3>
            <span className="text-xs text-slate-400 shrink-0">
              {plan.attendees.length} {plan.attendees.length === 1 ? "person" : "people"}
            </span>
          </div>

          {plan.notes && (
            <p className="text-sm text-slate-600 mb-3 whitespace-pre-wrap">{plan.notes}</p>
          )}

          {plan.attendees.length > 0 && (
            <ul className="text-sm text-slate-700 space-y-0.5 mb-3">
              {plan.attendees.map((a) => (
                <li key={a.user_name} className="flex items-center gap-2">
                  <span className={a.user_name === userName ? "font-semibold text-navy-800" : ""}>
                    {a.user_name}
                  </span>
                  {a.is_point_person && (
                    <span className="badge bg-amber-100 text-amber-800 text-[10px]">point person</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            {!isAttending ? (
              <button onClick={handleJoin} className="btn-primary text-sm" disabled={busy || !userName}>
                Join
              </button>
            ) : (
              <button onClick={handleLeave} className="btn-secondary text-sm" disabled={busy}>
                Leave
              </button>
            )}
            {isAttending && (
              <button onClick={handleTogglePP} className="btn-ghost text-sm" disabled={busy || (!!pointPerson && !isPointPerson)}>
                {isPointPerson
                  ? "Step down as point person"
                  : pointPerson
                  ? `${pointPerson.user_name} is point person`
                  : "Be point person"}
              </button>
            )}
            {isAttending && (
              <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-navy-700 ml-auto self-center">
                Edit
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function DinnersPage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [addPlanDay, setAddPlanDay] = useState<number | null>(null);

  const { data: plans, mutate } = useSWR<DinnerPlan[]>("/api/dinner-plans", fetcher, {
    refreshInterval: 5000,
  });

  useEffect(() => {
    const stored = localStorage.getItem("sut_name") || localStorage.getItem("unconference_name");
    if (stored) setUserName(stored);
    setLoaded(true);
  }, []);

  const handleSetName = useCallback((name: string) => {
    localStorage.setItem("sut_name", name);
    setUserName(name);
  }, []);

  if (!loaded) return null;

  const allPlans = plans || [];

  return (
    <>
      {!userName && <NamePrompt onSet={handleSetName} />}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-navy-600 hover:text-navy-800 text-sm font-medium inline-flex items-center gap-1 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>

        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-navy-900 tracking-tight">Dinner signups</h1>
            <p className="text-slate-500 mt-1">
              Sign up for dinner.{" "}
              <Link href="/restaurants" className="text-navy-600 hover:text-navy-800 underline">
                Need ideas?
              </Link>
            </p>
          </div>
          {userName && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                Signed in as <span className="font-medium text-navy-700">{userName}</span>
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem("sut_name");
                  localStorage.removeItem("unconference_name");
                  setUserName(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                change
              </button>
            </div>
          )}
        </div>

        <div className="space-y-12">
          {DAYS.map(({ day, label, fixed }) => {
            if (fixed) {
              return (
                <section key={day}>
                  <h2 className="text-xl font-bold text-navy-800 mb-4">{label}</h2>
                  <div className="card p-5">
                    <h3 className="text-lg font-bold text-navy-900 mb-1">{fixed.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{fixed.description}</p>
                  </div>
                </section>
              );
            }
            const dayPlans = allPlans.filter((p) => p.day === day);
            return (
              <section key={day}>
                <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                  <h2 className="text-xl font-bold text-navy-800">{label}</h2>
                  {userName && (
                    <button
                      onClick={() => setAddPlanDay(day)}
                      className="btn-ghost text-sm flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add a dinner plan
                    </button>
                  )}
                </div>

                {dayPlans.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No plans yet for {label}.</p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {dayPlans.map((p) => (
                      <PlanCard
                        key={p.id}
                        plan={p}
                        userName={userName || ""}
                        allPlans={allPlans}
                        onMutate={mutate}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {addPlanDay !== null && userName && (
        <AddPlanModal
          day={addPlanDay}
          dateLabel={DAYS.find((d) => d.day === addPlanDay)!.label}
          userName={userName}
          onClose={() => setAddPlanDay(null)}
          onCreated={() => mutate()}
        />
      )}
    </>
  );
}
