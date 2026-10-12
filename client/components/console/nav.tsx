"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { USE_MOCK } from "@/lib/api";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/live", label: "Live ward" },
  { href: "/gate", label: "Gate" },
  { href: "/trust", label: "Trust" },
  { href: "/evidence", label: "Evidence" },
];

export function ConsoleNav() {
  return <NavBar path={usePathname()} />;
}

/** Same bar without an active link; the Suspense fallback while the pathname resolves. */
export function NavBar({ path = "" }: { path?: string }) {
  const active = (href: string) => (href === "/live" ? path === "/live" || path.startsWith("/incidents") : path.startsWith(href));

  return (
    <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <nav className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-6 sm:gap-8 py-3" aria-label="Console">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <ShieldCheck className="text-healthy size-5" aria-hidden />
          Antibody
        </Link>
        <ul className="flex gap-1">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-base transition-colors",
                  active(href) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground ml-auto flex items-center gap-4 text-sm">
          {USE_MOCK && <span className="font-mono text-amber-300">mock mode</span>}
          <Link href="/" className="hover:text-foreground">
            About
          </Link>
        </div>
      </nav>
    </header>
  );
}
