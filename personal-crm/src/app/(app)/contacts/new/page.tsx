import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const dynamic = "force-dynamic";

export default function NewContactPage() {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/contacts" className="text-sm text-slate-400 hover:text-slate-700">
          ← Contacts
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Add contact</h1>
      </div>
      <ContactForm />
    </div>
  );
}
