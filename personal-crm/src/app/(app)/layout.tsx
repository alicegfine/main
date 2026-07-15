import Link from "next/link";
import { HeaderActions } from "@/components/HeaderActions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex items-center justify-between gap-4 py-5">
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link href="/" className="text-base font-semibold tracking-tight">
            🤝 Networking CRM
          </Link>
          <Link href="/" className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
            Dashboard
          </Link>
          <Link
            href="/contacts"
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            Contacts
          </Link>
        </nav>
        <HeaderActions />
      </header>
      <main>{children}</main>
    </div>
  );
}
