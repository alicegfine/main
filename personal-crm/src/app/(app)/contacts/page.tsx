import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dueInfo, dueLabel, isSnoozed } from "@/lib/cadence";
import { CadenceSelect } from "@/components/CadenceSelect";
import { SnoozeSelect } from "@/components/SnoozeSelect";
import { ReachedOutButton } from "@/components/ReachedOutButton";
import { ContactRowActions } from "@/components/ContactRowActions";
import { DuplicatesCard } from "@/components/DuplicatesCard";
import { findDuplicateGroups } from "@/lib/dedupe";
import { formatDate, relativeDays } from "@/lib/date";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  tag?: string;
  view?: string;
  due?: string;
  sort?: string;
}>;

const SORTS = [
  { key: "due", label: "Due first" },
  { key: "name", label: "Name" },
  { key: "cadence", label: "Cadence" },
  { key: "contact", label: "Last contact" },
  { key: "new", label: "Recently added" },
] as const;

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, tag, view, due, sort } = await searchParams;
  const currentSort = SORTS.some((s) => s.key === sort) ? (sort as string) : "due";

  // Views: networking contacts (default), coworkers, archived.
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

  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    currentSort === "name"
      ? [{ name: "asc" }]
      : currentSort === "cadence"
        ? [{ cadenceDays: { sort: "asc", nulls: "last" } }, { name: "asc" }]
        : currentSort === "contact"
          ? [{ lastContactAt: { sort: "asc", nulls: "first" } }]
          : currentSort === "new"
            ? [{ createdAt: "desc" }]
            : [{ updatedAt: "desc" }];

  const [rows, activeCount, coworkerCount, archivedCount, allForDupes] = await Promise.all([
    prisma.contact.findMany({ where, orderBy }),
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

  const now = new Date();
  const dueOnly = due === "1";
  const contacts = dueOnly ? rows.filter((c) => dueInfo(c, now).due) : rows;
  if (currentSort === "due") {
    // Due-first ordering: most overdue on top, then everyone else by recency.
    contacts.sort((a, b) => {
      const da = dueInfo(a, now);
      const db = dueInfo(b, now);
      if (da.due !== db.due) return da.due ? -1 : 1;
      if (da.due && db.due) return db.overdueDays - da.overdueDays;
      return 0;
    });
  }

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
  const baseHref = currentView ? `/contacts?view=${currentView}` : "/contacts";

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

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/contacts?view=${t.key}` : "/contacts"}
            className={
              currentView === t.key && !dueOnly
                ? "rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent dark:bg-slate-800 dark:text-white"
                : "rounded-full px-3 py-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }
          >
            {t.label}
          </Link>
        ))}
        {!currentView && (
          <Link
            href={dueOnly ? "/contacts" : "/contacts?due=1"}
            className={
              dueOnly
                ? "rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                : "rounded-full px-3 py-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }
          >
            🔔 Due now
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 text-xs uppercase tracking-wide text-slate-400">Sort</span>
        {SORTS.map((s) => {
          const sp = new URLSearchParams();
          if (currentView) sp.set("view", currentView);
          if (dueOnly) sp.set("due", "1");
          if (q) sp.set("q", q);
          if (s.key !== "due") sp.set("sort", s.key);
          const qs = sp.toString();
          return (
            <Link
              key={s.key}
              href={qs ? `/contacts?${qs}` : "/contacts"}
              className={
                currentSort === s.key
                  ? "rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                  : "rounded-full px-2.5 py-0.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        {currentView && <input type="hidden" name="view" value={currentView} />}
        {dueOnly && <input type="hidden" name="due" value="1" />}
        {currentSort !== "due" && <input type="hidden" name="sort" value={currentSort} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, company, tag…"
          className="min-w-56 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Search
        </button>
        {(q || tag) && (
          <Link href={baseHref} className="text-sm text-slate-400 hover:text-slate-700">
            Clear
          </Link>
        )}
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          {dueOnly
            ? "Nobody's due — you're all caught up. 🎉"
            : currentView === "archived"
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
                <th className="px-4 py-2 font-medium">Cadence</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Last contact</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contacts.map((c) => {
                const d = dueInfo(c, now);
                return (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.company && <div className="text-xs text-slate-400">{c.company}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <CadenceSelect contactId={c.id} cadenceDays={c.cadenceDays} />
                    </td>
                    <td
                      className="hidden px-4 py-2.5 text-xs text-slate-500 sm:table-cell"
                      title={formatDate(c.lastContactAt)}
                    >
                      {c.lastContactAt ? relativeDays(c.lastContactAt) : "never"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            c.scheduled
                              ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                              : isSnoozed(c, now)
                                ? "text-xs text-slate-400"
                                : d.due
                                  ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                                  : "text-xs text-slate-400"
                          }
                        >
                          {dueLabel(c, now)}
                        </span>
                        {d.due && <ReachedOutButton contactId={c.id} />}
                        {(d.due || isSnoozed(c, now)) && (
                          <SnoozeSelect contactId={c.id} snoozed={isSnoozed(c, now)} />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ContactRowActions
                        contactId={c.id}
                        isCoworker={c.isCoworker}
                        archived={c.archivedAt !== null}
                        scheduled={c.scheduled}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
