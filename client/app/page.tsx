import { SiteHeader } from "@/components/story/site-header";
import { Hero } from "@/components/story/hero";
import { RunTicker } from "@/components/story/run-ticker";
import { FailureReveal } from "@/components/story/failure-reveal";
import { IncidentPlayer } from "@/components/story/incident-player";
import { Proof } from "@/components/story/proof";
import { Compare } from "@/components/story/compare";
import { Closing } from "@/components/story/closing";

export default function Landing() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <RunTicker />
        <FailureReveal />
        <IncidentPlayer />
        <Proof />
        <Compare />
        <Closing />
      </main>
    </>
  );
}
