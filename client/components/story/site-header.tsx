import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-border/60 bg-background/70 fixed inset-x-0 top-0 z-40 border-b backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-6" aria-label="Site">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Mark />
          Antibody
        </Link>
        <div className="text-muted-foreground hidden items-center gap-6 text-sm md:flex">
          <a href="#failure" className="hover:text-foreground transition-colors">The problem</a>
          <a href="#replay" className="hover:text-foreground transition-colors">Replay</a>
          <a href="#proof" className="hover:text-foreground transition-colors">Proof</a>
          <a href="#compare" className="hover:text-foreground transition-colors">Compare</a>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://github.com/dripston/hackathon"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground hidden text-sm transition-colors sm:block"
          >
            GitHub
          </a>
          <Link href="/connect" className="text-muted-foreground hover:text-foreground hidden text-sm transition-colors sm:block">
            Get started
          </Link>
          <Link
            href="/live"
            className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          >
            Open app
          </Link>
        </div>
      </nav>
    </header>
  );
}

/** The logo: a cross-shaped antibody glyph with a vital-sign dot. */
export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 22V12M12 12L5 5M12 12l7-7M5 5 3.5 3.5M19 5l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="3" cy="3" r="1.6" className="fill-healthy" />
      <circle cx="21" cy="3" r="1.6" className="fill-healthy" />
    </svg>
  );
}
