"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

export default function HomePage() {
  const [userName, setUserName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <>
      {!userName && <NamePrompt onSet={handleSetName} />}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-navy-900 tracking-tight">Montreal Offsite</h1>
          {userName && (
            <p className="text-slate-500 mt-3">
              Signed in as <span className="font-medium text-navy-700">{userName}</span>
              <button
                onClick={() => {
                  localStorage.removeItem("sut_name");
                  localStorage.removeItem("unconference_name");
                  setUserName(null);
                }}
                className="ml-3 text-xs text-slate-400 hover:text-slate-600"
              >
                change
              </button>
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Link href="/agenda" className="card p-8 hover:shadow-md transition-shadow group block">
            <h2 className="text-2xl font-bold text-navy-800 group-hover:text-navy-600 transition-colors mb-2">
              Agenda
            </h2>
            <p className="text-slate-500">
              The full 3-day schedule at a glance.
            </p>
          </Link>

          <Link href="/logistics" className="card p-8 hover:shadow-md transition-shadow group block">
            <h2 className="text-2xl font-bold text-navy-800 group-hover:text-navy-600 transition-colors mb-2">
              Logistics
            </h2>
            <p className="text-slate-500">
              Address, meals, comms &mdash; everything you need to know.
            </p>
          </Link>

          <Link href="/ama" className="card p-8 hover:shadow-md transition-shadow group block">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge bg-navy-100 text-navy-700">Day 1</span>
            </div>
            <h2 className="text-2xl font-bold text-navy-800 group-hover:text-navy-600 transition-colors mb-2">
              Director AMAs
            </h2>
            <p className="text-slate-500">
              Submit and upvote questions for each director, answered in a live panel.
            </p>
          </Link>

          <Link href="/sut" className="card p-8 hover:shadow-md transition-shadow group block">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge bg-amber-100 text-amber-800">Day 2</span>
            </div>
            <h2 className="text-2xl font-bold text-navy-800 group-hover:text-navy-600 transition-colors mb-2">
              Structured Unstructured Time
            </h2>
            <p className="text-slate-500">
              Host sessions, propose ideas, and organize the schedule together.
            </p>
          </Link>
        </div>

        <div className="mt-16 border-t border-slate-200 pt-8 max-w-2xl mx-auto text-center">
          <p className="text-sm text-slate-500 leading-relaxed">
            <span className="font-medium text-slate-600">Our north star:</span> Focus on cost-effective and leveraged bets to advance countermeasures against pandemic pathogens, especially those that reduce risk in 2&ndash;5 years, to save as many lives as possible.
          </p>
          <p className="text-xs text-slate-400 mt-3">
            Agency &middot; Excellence &middot; Extreme Ownership &middot; Maximizing Impact &middot; Strategic Thinking &middot; Truthseeking
          </p>
        </div>
      </div>
    </>
  );
}
