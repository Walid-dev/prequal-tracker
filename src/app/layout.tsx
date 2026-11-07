// The root layout: the header and content area that every page shares.
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Every page reads the database, so render on each request instead of at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prequal Tracker",
  description: "Subcontractor prequalification with AI response triage.",
};

/** Wraps every page in the same header and content width. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/cases" className="font-semibold tracking-tight">
              Prequal Tracker
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/cases" className="hover:text-slate-900">
                Cases
              </Link>
              <Link href="/cases/new" className="hover:text-slate-900">
                New case
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
