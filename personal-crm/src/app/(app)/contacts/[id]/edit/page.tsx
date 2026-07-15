import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ContactForm, ContactFormValues } from "@/components/ContactForm";

export const dynamic = "force-dynamic";

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) notFound();

  const initial: ContactFormValues = {
    name: contact.name,
    email: contact.email ?? "",
    company: contact.company ?? "",
    role: contact.role ?? "",
    linkedinUrl: contact.linkedinUrl ?? "",
    howMet: contact.howMet ?? "",
    tags: contact.tags ?? "",
    status: contact.status,
    notes: contact.notes ?? "",
    lastContactAt: toDateInput(contact.lastContactAt),
    nextFollowUpAt: toDateInput(contact.nextFollowUpAt),
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href={`/contacts/${id}`} className="text-sm text-slate-400 hover:text-slate-700">
          ← Back
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Edit {contact.name}</h1>
      </div>
      <ContactForm id={id} initial={initial} />
    </div>
  );
}
