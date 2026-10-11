"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { USE_MOCK } from "@/lib/api";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Live ward" },
  { href: "/gate", label: "Gate" },
  { href: "/trust", label: "Trust" },
  { href: "/evidence", label: "Evidence" },
];

export function ConsoleNav() {
  return <NavBar path={usePathname()} />;
}

/** Same bar without an active link; the Suspense fallback while the pathname resolves. */
export function NavBar({ path = "" }: { path?: string }) {
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/incidents") : path.startsWith(href));

  return (
    <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <nav className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-3 sm:gap-8 sm:px-6" aria-label="Console">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight">
          <ShieldCheck className="text-healthy size-5" aria-hidden />
          <span className="hidden sm:inline">Antibody</span>
        </Link>
        <ul className="flex min-w-0 gap-0.5 sm:gap-1">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors sm:px-3 sm:text-base",
                  active(href) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground ml-auto hidden items-center gap-4 text-sm sm:flex">
          {USE_MOCK && <span className="font-mono text-amber-300">mock mode</span>}
          <Link href="/welcome" className="hover:text-foreground">
            About
          </Link>
        </div>
      </nav>
    </header>
  );
}
