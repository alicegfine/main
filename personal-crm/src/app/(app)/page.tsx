import Link from "next/link";
import type { Contact } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildDigestData } from "@/lib/digest";
import { formatDate, relativeDays } from "@/lib/date";
import { CHANNEL_LABELS, Channel } from "@/lib/status";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ContactList({
  contacts,
  meta,
  emptyText,
}: {
  contacts: Contact[];
  meta: (c: Contact) => string;
  emptyText: string;
}) {
  if (contacts.length === 0) {
    return <p className="px-1 py-3 text-sm text-slate-400">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link
            href={`/contacts/${c.id}`}
            className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <span className="min-w-0">
              <span className="font-medium">{c.name}</span>
              {c.company && <span className="text-slate-400"> · {c.company}</span>}
            </span>
            <span className="shrink-0 text-xs text-slate-500">{meta(c)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const [digest, totalContacts, recent] = await Promise.all([
    buildDigestData(),
    prisma.contact.count(),
    prisma.interaction.findMany({
      orderBy: { occurredAt: "desc" },
      take: 8,
      include: { contact: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link
          href="/contacts/new"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          + Add contact
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Contacts" value={totalContacts} />
        <Stat label="Pending replies" value={digest.pendingReplies.length} />
        <Stat label="Overdue follow-ups" value={digest.overdueFollowUps.length} />
        <Stat label="Going cold" value={digest.goingCold.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="⏳ Pending replies" hint="waiting to hear back">
          <ContactList
            contacts={digest.pendingReplies}
            meta={(c) => `last contact ${relativeDays(c.lastContactAt)}`}
            emptyText="Nobody's pending. 🎉"
          />
        </Card>
        <Card title="🔔 Overdue follow-ups" hint="past their follow-up date">
          <ContactList
            contacts={digest.overdueFollowUps}
            meta={(c) => `due ${relativeDays(c.nextFollowUpAt)}`}
            emptyText="All caught up. 🎉"
          />
        </Card>
        <Card title="🥶 Going cold" hint="no contact recently">
          <ContactList
            contacts={digest.goingCold}
            meta={(c) => `last contact ${relativeDays(c.lastContactAt)}`}
            emptyText="Nothing going cold."
          />
        </Card>
        <Card title="🗒️ Recent activity">
          {recent.length === 0 ? (
            <p className="px-1 py-3 text-sm text-slate-400">No interactions logged yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
                  <Link href={`/contacts/${i.contact.id}`} className="min-w-0 hover:underline">
                    <span className="font-medium">{i.contact.name}</span>
                    <span className="text-slate-400">
                      {" "}
                      · {CHANNEL_LABELS[i.channel as Channel] ?? i.channel}
                    </span>
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(i.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
