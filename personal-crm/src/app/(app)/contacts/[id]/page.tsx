import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/date";
import { CHANNEL_LABELS, Channel } from "@/lib/status";
import { granolaNoteUrl } from "@/lib/granola";
import { dueLabel } from "@/lib/cadence";
import { CadenceSelect } from "@/components/CadenceSelect";
import { ContactRowActions } from "@/components/ContactRowActions";
import { LogInteractionForm } from "@/components/LogInteractionForm";
import { DeleteContactButton } from "@/components/DeleteContactButton";
import { DeleteInteractionButton } from "@/components/DeleteInteractionButton";
import { InlineContactEditor, EditorValues } from "@/components/InlineContactEditor";

export const dynamic = "force-dynamic";

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
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

  const initial: EditorValues = {
    name: contact.name,
    email: contact.email ?? "",
    company: contact.company ?? "",
    role: contact.role ?? "",
    linkedinUrl: contact.linkedinUrl ?? "",
    howMet: contact.howMet ?? "",
    tags: contact.tags ?? "",
    notes: contact.notes ?? "",
    lastContactAt: toDateInput(contact.lastContactAt),
    nextFollowUpAt: toDateInput(contact.nextFollowUpAt),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/contacts" className="text-sm text-slate-400 hover:text-slate-700">
          ← Contacts
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{contact.name}</h1>
            {contact.isCoworker && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                coworker
              </span>
            )}
            {contact.archivedAt && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                archived
              </span>
            )}
            {contact.linkedinUrl && (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent hover:underline"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                contact.scheduled
                  ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-xs text-slate-500"
              }
            >
              {dueLabel(contact)}
            </span>
            <CadenceSelect contactId={contact.id} cadenceDays={contact.cadenceDays} />
            <ContactRowActions
              contactId={contact.id}
              isCoworker={contact.isCoworker}
              archived={contact.archivedAt !== null}
              scheduled={contact.scheduled}
            />
            <DeleteContactButton contactId={contact.id} />
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <InlineContactEditor id={contact.id} initial={initial} />
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
                    {granolaNoteUrl(i.granolaNoteId, i.granolaUrl) && (
                      <a
                        href={granolaNoteUrl(i.granolaNoteId, i.granolaUrl)!}
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
