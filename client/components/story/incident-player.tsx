"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, GitMerge, Mic, Pause, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { ScenarioGrid } from "@/components/console/scenario-grid";
import { DiffView } from "@/components/console/diff-view";
import { STORY, commitUrl, short } from "@/lib/story/case";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/story/reveal";

const STAGE_MS = 11000;

const inc = STORY.incident;
const diag = inc.diagnosis!;
const res = inc.resolution!;
const scenarios = inc.scenarios ?? [];
const attempt = (inc.attempts ?? []).find((a) => a.accepted) ?? (inc.attempts ?? [])[0];
const baseline = inc.families.find((f) => f.candidate === "baseline") ?? inc.families[0];
const seeded = STORY.trust.seeded_bugs.find((b) => b.commit === diag.commit_sha);
const gateRow = STORY.gate.families.find((f) => f.incident_id === inc.incident.id);
const prNumber = res.pr_url?.split("/").pop();
const fixN = res.accepted_fix_id?.replace("fix_", "") ?? "1";

const STAGES = [
  { key: "caught", label: "Caught", hint: "a silent failure keeps firing" },
  { key: "cause", label: "Cause", hint: "the commit, and why it was made" },
  { key: "family", label: "Family", hint: "one incident becomes 10 tests" },
  { key: "proof", label: "Proof", hint: "the fix passes the whole family" },
  { key: "approved", label: "Approved", hint: "by voice, on a phone call" },
  { key: "immune", label: "Immune", hint: "the bug can't come back" },
] as const;

export function IncidentPlayer() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Start playing the first time the player scrolls into view.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        setPlaying(true);
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now() - elapsed;
    let raf = 0;
    const tick = (now: number) => {
      const e = now - t0;
      if (e >= STAGE_MS) {
        setElapsed(0);
        setStage((s) => {
          if (s >= STAGES.length - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
        return;
      }
      setElapsed(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // elapsed is read once per (re)start on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stage]);

  const go = (i: number) => {
    setStage(i);
    setElapsed(0);
  };
  const restart = () => {
    go(0);
    setPlaying(true);
  };

  return (
    <section id="replay" className="scroll-mt-16 border-y border-border/60 bg-card/20 py-28">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">02 · Replay a real incident</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
              From silent failure to immune, in one loop.
            </h2>
          </div>
          <p className="text-muted-foreground max-w-sm text-sm">
            <span className="border-border text-foreground mr-2 rounded border px-1.5 py-0.5 font-mono text-[11px]">RECORDED</span>
            {STORY.note} Incident <span className="font-mono">{inc.incident.id}</span>.
          </p>
        </Reveal>

        <div ref={root} className="border-border bg-background/70 mt-12 grid overflow-hidden rounded-2xl border lg:grid-cols-[300px_1fr]">
          {/* Stage rail */}
          <ol className="border-border flex gap-1 overflow-x-auto border-b p-3 lg:flex-col lg:border-r lg:border-b-0">
            {STAGES.map((s, i) => (
              <li key={s.key} className="shrink-0">
                <button
                  onClick={() => go(i)}
                  className={cn(
                    "relative w-full overflow-hidden rounded-xl px-4 py-3 text-left transition-colors",
                    i === stage ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full font-mono text-[11px]",
                        i < stage ? "bg-healthy text-background" : i === stage ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className={cn("block font-medium", i > stage && "text-muted-foreground")}>{s.label}</span>
                      <span className="text-muted-foreground hidden text-xs lg:block">{s.hint}</span>
                    </span>
                  </span>
                  {i === stage && (
                    <span
                      className="bg-healthy absolute bottom-0 left-0 h-0.5"
                      style={{ width: `${playing ? (elapsed / STAGE_MS) * 100 : 100}%` }}
                    />
                  )}
                </button>
              </li>
            ))}
            <li className="mt-auto hidden gap-2 p-2 lg:flex">
              <button
                onClick={() => (stage === STAGES.length - 1 && !playing ? restart() : setPlaying((p) => !p))}
                className="border-border hover:bg-accent inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              >
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {playing ? "Pause" : "Play"}
              </button>
              <button onClick={restart} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2 text-sm">
                <RotateCcw className="size-3.5" /> Restart
              </button>
            </li>
          </ol>

          {/* Stage content */}
          <div className="min-h-[560px] p-7 sm:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
              >
                {stage === 0 && <Caught />}
                {stage === 1 && <Cause />}
                {stage === 2 && <Family />}
                {stage === 3 && <Proof />}
                {stage === 4 && <Approved />}
                {stage === 5 && <Immune />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageTitle({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p className="eyebrow">{kicker}</p>
      <h3 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h3>
      {children && <p className="text-muted-foreground mt-3 max-w-2xl text-lg">{children}</p>}
    </div>
  );
}

function Caught() {
  const intake = inc.intake;
  return (
    <div>
      <StageTitle kicker="11:02 UTC · production" title="A tripwire keeps firing on 200 OK responses.">
        No crash, no error rate spike. Antibody&apos;s check saw the agent report &ldquo;no decision makers&rdquo; right
        after a failed people search, again and again.
      </StageTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Detection" value={inc.incident.detection} mono tone="infected" />
        <Metric label={`Fired in ${intake?.window_minutes ?? 10} min`} value={`${intake?.occurrences ?? inc.incident.trace_ids.length}×`} tone="infected" />
        <Metric label="Failing traces captured" value={String(inc.incident.trace_ids.length)} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {inc.incident.trace_ids.slice(0, 8).map((t) => (
          <span key={t} className="border-border text-muted-foreground rounded-md border px-2 py-1 font-mono text-xs">
            {t.slice(0, 12)}…
          </span>
        ))}
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        Incident opened automatically: <span className="text-foreground font-mono">{inc.incident.id}</span>
      </p>
    </div>
  );
}

function Cause() {
  return (
    <div>
      <StageTitle kicker="Diagnosis" title="It found the exact commit, and why it was written.">
        {diag.explanation}
      </StageTitle>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="border-border rounded-xl border p-5">
          <p className="text-muted-foreground text-sm">Caused by</p>
          <a href={commitUrl(diag.commit_sha!)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 font-mono text-2xl hover:underline">
            {short(diag.commit_sha)} <ExternalLink className="size-4" />
          </a>
          <p className="text-muted-foreground mt-4 text-sm">File</p>
          <p className="font-mono text-sm">{diag.target_file}</p>
          <p className="text-muted-foreground mt-4 text-sm">Fix kind</p>
          <p className="font-mono text-sm">{diag.fix_kind}</p>
        </div>
        <figure className="border-healthy/30 bg-healthy/[0.04] rounded-xl border p-6">
          <p className="eyebrow text-healthy!">
            {diag.reasoning_source === "entire_checkpoint" ? "From the Entire checkpoint" : "From the commit message"}
          </p>
          <blockquote className="mt-4 text-lg leading-relaxed">&ldquo;{(diag.reasoning_excerpt ?? "").slice(0, 320)}{(diag.reasoning_excerpt ?? "").length > 320 ? "…" : ""}&rdquo;</blockquote>
          {diag.checkpoint_url && (
            <a href={diag.checkpoint_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground mt-4 inline-flex items-center gap-1.5 text-sm">
              The coding-agent session that made the change <ExternalLink className="size-3.5" />
            </a>
          )}
        </figure>
      </div>
    </div>
  );
}

function Family() {
  const groups = [
    { role: "must_fix", title: "Must fix", note: "variants of the failure: other companies, other errors" },
    { role: "must_not_change", title: "Must not change", note: "healthy cases a fix is not allowed to break" },
  ] as const;
  return (
    <div>
      <StageTitle kicker="Breeding" title={`One incident becomes a family of ${scenarios.length} tests.`}>
        Each variant replays real recorded Crustdata responses with a fault injected, so the fix is tested on the
        failure&apos;s whole neighbourhood, not just the one trace.
      </StageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.role}>
            <p className={cn("font-medium", g.role === "must_fix" ? "text-infected" : "text-healthy")}>{g.title}</p>
            <p className="text-muted-foreground text-sm">{g.note}</p>
            <ul className="mt-3 space-y-1.5">
              {scenarios.filter((s) => s.role === g.role).map((s) => (
                <li key={s.id} className="border-border flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{s.domain}</span>
                  <span className="text-muted-foreground font-mono text-xs">{s.faults[0]?.error.code ?? "no fault"}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Proof() {
  if (!attempt?.result) return null;
  return (
    <div>
      <StageTitle kicker={`${attempt.fix.id} · attempt ${attempt.fix.attempt}`} title="The smallest fix, proven on the whole family.">
        {attempt.fix.description}
      </StageTitle>
      <ScenarioGrid scenarios={scenarios} from={baseline} to={attempt.result} />
      <details className="border-border mt-6 rounded-xl border">
        <summary className="text-muted-foreground cursor-pointer px-4 py-3 text-sm">Show the diff</summary>
        <div className="border-border border-t p-4">
          <DiffView diff={attempt.fix.diff} />
        </div>
      </details>
    </div>
  );
}

function Approved() {
  const at = res.approval?.at ? new Date(res.approval.at) : null;
  const time = at ? at.toISOString().slice(11, 16) + " UTC" : "";
  return (
    <div>
      <StageTitle kicker="Human in the loop" title="Antibody called the engineer. They approved it by voice.">
        Nothing merges on &ldquo;yes&rdquo; or &ldquo;ok&rdquo;. Only the exact phrase, typed or spoken, merges the pull request.
      </StageTitle>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="border-border rounded-2xl border bg-[oklch(0.15_0.02_240)] p-5">
          <p className="text-muted-foreground mb-4 text-center font-mono text-xs">@anti_body_bot · Telegram</p>
          <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-[oklch(0.25_0.03_240)] p-4 text-sm leading-relaxed">
            <p className="mb-2 flex items-center gap-2 text-xs text-[oklch(0.8_0.1_220)]">
              <Mic className="size-3.5" /> voice note · Antibody
            </p>
            {STORY.brief.split(". ").slice(0, 3).join(". ")}. To merge it, say: <b>approve fix {fixN}</b>.
          </div>
          <div className="mt-3 ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-[oklch(0.45_0.12_250)] p-3">
            <div className="flex items-center gap-3">
              <Mic className="size-4" />
              <Waveform />
              <span className="font-mono text-xs opacity-80">0:02</span>
            </div>
            <p className="mt-2 text-sm">&ldquo;{res.approval?.phrase ?? `approve fix ${fixN}`}&rdquo;</p>
          </div>
          <div className="mt-3 max-w-[90%] rounded-2xl rounded-tl-sm bg-[oklch(0.25_0.03_240)] p-3 text-sm">
            Approved fix {fixN} and merged. The incident is resolved.
          </div>
        </div>
        <div className="space-y-4">
          <Metric label="Approved via" value={res.approval?.channel === "voice" ? "Voice (Telegram)" : "Typed"} />
          <Metric label="At" value={time} mono />
          {res.pr_url && (
            <a href={res.pr_url} target="_blank" rel="noreferrer" className="border-border hover:bg-accent flex items-center gap-3 rounded-xl border p-4 transition-colors">
              <GitMerge className="text-healthy size-5" />
              <span>
                <span className="block font-medium">Pull request #{prNumber} merged</span>
                <span className="text-muted-foreground text-sm">evidence table, commit and reasoning in the PR</span>
              </span>
              <ExternalLink className="text-muted-foreground ml-auto size-4" />
            </a>
          )}
          <Metric label="Antibody's cost for this incident" value={`$${res.cost_usd.toFixed(3)} · ${Math.round(res.duration_ms / 1000)} s`} mono />
        </div>
      </div>
    </div>
  );
}

function Immune() {
  return (
    <div>
      <StageTitle kicker="Immunity" title="The family becomes a deploy gate. This bug can't quietly return.">
        Every future branch is replayed against the saved family before it ships. Re-introduce the bug and the deploy is
        blocked.
      </StageTitle>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="border-infected/40 glow-infected rounded-2xl border p-6">
          <p className="eyebrow">Backtest · commit {short(diag.commit_sha)}</p>
          <p className="text-infected mt-3 text-4xl font-semibold">BLOCKED</p>
          <p className="text-muted-foreground mt-2 font-mono text-sm">{seeded?.note ?? "the causing commit re-opens the incident"}</p>
        </div>
        <div className="border-healthy/40 glow-healthy rounded-2xl border p-6">
          <p className="eyebrow">Gate · main after the merge</p>
          <p className="text-healthy mt-3 flex items-center gap-2 text-4xl font-semibold">
            <ShieldCheck className="size-8" /> SAFE
          </p>
          <p className="text-muted-foreground mt-2 font-mono text-sm">{gateRow?.message ?? "all families pass"}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "infected" | "healthy" }) {
  return (
    <div className="border-border rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn("mt-1 font-semibold [overflow-wrap:anywhere]", mono ? "font-mono text-lg" : "text-xl", tone === "infected" && "text-infected", tone === "healthy" && "text-healthy")}>{value}</p>
    </div>
  );
}

function Waveform() {
  const bars = [4, 9, 14, 7, 12, 16, 10, 6, 13, 8, 15, 9, 5, 11, 7];
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden>
      {bars.map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-white/80" style={{ height: h }} />
      ))}
    </span>
  );
}
