import type { Metadata } from "next";
import "./globals.css";
import SuggestionButton from "@/components/SuggestionButton";

export const metadata: Metadata = {
  title: "Montreal Offsite",
  description: "Montreal Offsite — agenda, logistics, and team-led sessions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {children}
        <SuggestionButton />
      </body>
    </html>
  );
}
