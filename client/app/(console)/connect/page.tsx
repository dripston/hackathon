"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Page, PageHeader } from "@/components/control/panel";

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
    <Page className="max-w-4xl">
      <PageHeader title="Connect an agent" description="Five steps, about 15 minutes. This is exactly how sales-research-agent is wired." />
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative pb-10 last:pb-0">
            {i < STEPS.length - 1 && <span className="bg-border absolute top-9 bottom-0 left-[15px] w-px" aria-hidden />}
            <div className="flex items-start gap-5">
              <span className="border-border bg-card relative grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs font-semibold">{i + 1}</span>
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="font-medium">{s.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{s.body}</p>
                <CodeBlock code={s.code} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Page>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-border bg-sidebar relative mt-3 overflow-hidden rounded-lg border">
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
