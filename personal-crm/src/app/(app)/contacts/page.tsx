import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STATUSES, STATUS_LABELS, isStatus } from "@/lib/status";
import { StatusSelect } from "@/components/StatusSelect";
import { ContactRowActions } from "@/components/ContactRowActions";
import { DuplicatesCard } from "@/components/DuplicatesCard";
import { findDuplicateGroups } from "@/lib/dedupe";
import { formatDate, relativeDays } from "@/lib/date";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; status?: string; tag?: string; view?: string }>;

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status, tag, view } = await searchParams;

  // Three views: networking contacts (default), coworkers, archived.
  const where: Prisma.ContactWhereInput = {};
  if (view === "archived") {
    where.archivedAt = { not: null };
  } else if (view === "coworkers") {
    where.archivedAt = null;
    where.isCoworker = true;
  } else {
    where.archivedAt = null;
    where.isCoworker = false;
  }

  if (status && isStatus(status)) where.status = status;
  if (tag) where.tags = { contains: tag };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { company: { contains: q } },
      { role: { contains: q } },
      { email: { contains: q } },
      { tags: { contains: q } },
    ];
  }

  const [contacts, activeCount, coworkerCount, archivedCount, allForDupes] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: [{ updatedAt: "desc" }] }),
    prisma.contact.count({ where: { archivedAt: null, isCoworker: false } }),
    prisma.contact.count({ where: { archivedAt: null, isCoworker: true } }),
    prisma.contact.count({ where: { archivedAt: { not: null } } }),
    prisma.contact.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        isCoworker: true,
        archivedAt: true,
        _count: { select: { interactions: true } },
      },
    }),
  ]);

  // Duplicate detection scans everyone (views don't matter — a "Lesley"
  // suggestion-dupe may be archived while coworker Lesley Smith is not).
  const dupeGroups = findDuplicateGroups(
    allForDupes.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      isCoworker: c.isCoworker,
      archived: c.archivedAt !== null,
      interactions: c._count.interactions,
    })),
  );

  const tabs = [
    { key: "", label: `People (${activeCount})` },
    { key: "coworkers", label: `Coworkers (${coworkerCount})` },
    { key: "archived", label: `Archived (${archivedCount})` },
  ];
  const currentView = view === "coworkers" || view === "archived" ? view : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contacts</h1>
        <Link
          href="/contacts/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Add contact
        </Link>
      </div>

      <DuplicatesCard groups={dupeGroups} />

      <div className="flex items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/contacts?view=${t.key}` : "/contacts"}
            className={
              currentView === t.key
                ? "rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent dark:bg-slate-800 dark:text-white"
                : "rounded-full px-3 py-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        {currentView && <input type="hidden" name="view" value={currentView} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, company, tag…"
          className="min-w-56 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none dark:border-slate-700 dark:bg-slate-900"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Filter
        </button>
        {(q || status || tag) && (
          <Link
            href={currentView ? `/contacts?view=${currentView}` : "/contacts"}
            className="text-sm text-slate-400 hover:text-slate-700"
          >
            Clear
          </Link>
        )}
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          {currentView === "archived"
            ? "Nothing archived."
            : currentView === "coworkers"
              ? "No coworkers yet — they're flagged automatically by email domain during sync."
              : (
                <>
                  No contacts yet.{" "}
                  <Link href="/contacts/new" className="text-accent hover:underline">
                    Add your first one
                  </Link>{" "}
                  or run a Granola sync.
                </>
              )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Tags</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Last contact</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.company && <div className="text-xs text-slate-400">{c.company}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusSelect contactId={c.id} status={c.status} />
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-slate-500 md:table-cell">
                    {c.tags || "—"}
                  </td>
                  <td
                    className="hidden px-4 py-2.5 text-xs text-slate-500 sm:table-cell"
                    title={formatDate(c.lastContactAt)}
                  >
                    {c.lastContactAt ? relativeDays(c.lastContactAt) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ContactRowActions
                      contactId={c.id}
                      isCoworker={c.isCoworker}
                      archived={c.archivedAt !== null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
