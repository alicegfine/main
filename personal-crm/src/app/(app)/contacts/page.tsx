import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { STATUSES, STATUS_LABELS, isStatus } from "@/lib/status";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, relativeDays } from "@/lib/date";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; status?: string; tag?: string }>;

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const { q, status, tag } = await searchParams;

  const where: Prisma.ContactWhereInput = {};
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

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: { _count: { select: { interactions: true } } },
  });

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

      <form method="GET" className="flex flex-wrap items-center gap-2">
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
          <Link href="/contacts" className="text-sm text-slate-400 hover:text-slate-700">
            Clear
          </Link>
        )}
      </form>

      <p className="text-xs text-slate-400">
        {contacts.length} contact{contacts.length === 1 ? "" : "s"}
      </p>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
          No contacts yet. <Link href="/contacts/new" className="text-accent hover:underline">Add your first one</Link> or run a Granola sync.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Status</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Tags</th>
                <th className="px-4 py-2 font-medium">Last contact</th>
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
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-slate-500 md:table-cell">
                    {c.tags || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500" title={formatDate(c.lastContactAt)}>
                    {c.lastContactAt ? relativeDays(c.lastContactAt) : "—"}
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
