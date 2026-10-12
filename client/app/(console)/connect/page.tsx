"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const STEPS = [
  {
    title: "Trace your agent with neatlogs",
    body: "Every run becomes a trace Antibody can read. One line at startup, one span per run.",
    code: `pip install neatlogs

import neatlogs
neatlogs.init(api_key=NEATLOGS_API_KEY, workflow_name="company-research")

with neatlogs.trace("company-research"):
    brief = run_agent(domain)`,
  },
  {
    title: "Score every run",
    body: "Deterministic tripwires catch silent failures (an empty answer after a tool error, an invented person, a skipped check). Jev adds a grounding score. The scores travel on the trace.",
    code: `from detection.checks.score import score_run

score = score_run(run)          # tripwires + Jev
# violations -> neatlogs span "antibody.score"`,
  },
  {
    title: "Turn on Antibody's detections",
    body: "Creates one neatlogs detection per tripwire. When one keeps firing, Antibody opens an incident.",
    code: `uv run antibody neatlogs-setup
uv run antibody watch`,
  },
  {
    title: "Connect GitHub and Entire",
    body: "Antibody opens a pull request for every proven fix, and reads the Entire checkpoint to quote why the breaking change was made.",
    code: `gh auth login
entire login
entire repo mirror add /gh/<owner>/<repo>`,
  },
  {
    title: "Pick who gets called",
    body: "Open @anti_body_bot on Telegram and send /oncall. When a fix is proven, Antibody calls that chat; only “approve fix N” merges it.",
    code: `/oncall`,
  },
];

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Connect an agent</h1>
        <p className="text-muted-foreground mt-1">Five steps, about 15 minutes. This is exactly how sales-research-agent is wired.</p>
      </div>
      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="border-border bg-card/60 rounded-2xl border p-6 shadow-lg shadow-black/10">
            <div className="flex items-start gap-4">
              <span className="bg-brand/15 text-brand grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-medium">{s.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{s.body}</p>
                <CodeBlock code={s.code} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-border relative mt-4 overflow-hidden rounded-xl border bg-[oklch(0.15_0.025_268)]">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
        className="text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5 rounded-md p-1.5"
        aria-label="Copy"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed">{code}</pre>
    </div>
  );
}
