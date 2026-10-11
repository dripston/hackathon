import { Evidence } from "@/components/welcome/evidence";
import { Hero } from "@/components/welcome/hero";
import { Pipeline } from "@/components/welcome/pipeline";
import { SilentFailures } from "@/components/welcome/silent-failures";
import { VoiceCall } from "@/components/welcome/voice-call";

export default function Home() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-20">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6" aria-label="Main">
          <span className="font-semibold tracking-tight">Antibody</span>
          <div className="text-muted-foreground flex gap-6 text-sm">
            <a href="#problem" className="hover:text-foreground">Problem</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#incident" className="hover:text-foreground">Incident</a>
          </div>
        </nav>
      </header>

      <main>
        <Hero />
        <SilentFailures />
        <Pipeline />
        <VoiceCall />
        <Evidence />
      </main>

      <footer className="border-border text-muted-foreground border-t px-4 py-10 text-center text-sm">
        The others fix agents that crash. Antibody catches the ones that don&apos;t.
      </footer>
    </>
  );
}
