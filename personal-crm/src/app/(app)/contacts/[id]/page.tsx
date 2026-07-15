import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, relativeDays } from "@/lib/date";
import { CHANNEL_LABELS, Channel } from "@/lib/status";
import { StatusSelect } from "@/components/StatusSelect";
import { LogInteractionForm } from "@/components/LogInteractionForm";
import { DeleteContactButton } from "@/components/DeleteContactButton";
import { DeleteInteractionButton } from "@/components/DeleteInteractionButton";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { interactions: { orderBy: { occurredAt: "desc" } } },
  });
  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contacts" className="text-sm text-slate-400 hover:text-slate-700">
          ← Contacts
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{contact.name}</h1>
            {(contact.role || contact.company) && (
              <p className="text-sm text-slate-500">
                {[contact.role, contact.company].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StatusSelect contactId={contact.id} status={contact.status} />
            <Link
              href={`/contacts/${contact.id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Edit
            </Link>
            <DeleteContactButton contactId={contact.id} />
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Email">
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="text-accent hover:underline">
                {contact.email}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="LinkedIn">
            {contact.linkedinUrl ? (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Profile ↗
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Tags">{contact.tags || "—"}</Field>
          <Field label="Last contact">{formatDate(contact.lastContactAt)}</Field>
          <Field label="Next follow-up">
            {contact.nextFollowUpAt ? (
              <span>
                {formatDate(contact.nextFollowUpAt)}{" "}
                <span className="text-xs text-slate-400">({relativeDays(contact.nextFollowUpAt)})</span>
              </span>
            ) : (
              "—"
            )}
          </Field>
          <Field label="How you met">{contact.howMet || "—"}</Field>
        </dl>
        {contact.notes && (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm">{contact.notes}</dd>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold">Log an interaction</h2>
        <LogInteractionForm contactId={contact.id} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Conversation history ({contact.interactions.length})
        </h2>
        {contact.interactions.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing logged yet. Log an interaction above, or it&apos;ll fill in from Granola on the next sync.
          </p>
        ) : (
          <ol className="space-y-3">
            {contact.interactions.map((i) => (
              <li
                key={i.id}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {CHANNEL_LABELS[i.channel as Channel] ?? i.channel}
                    </span>
                    <span className="text-slate-400">{formatDate(i.occurredAt)}</span>
                    {i.granolaUrl && (
                      <a
                        href={i.granolaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        Open in Granola ↗
                      </a>
                    )}
                  </div>
                  <DeleteInteractionButton id={i.id} />
                </div>
                {i.summary && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {i.summary}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
