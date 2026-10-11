"use client";

import { useState } from "react";
import { APPROVAL_PATTERN, ApiError, approveFix, rejectFix } from "@/lib/api";
import type { Resolution } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Outcome = { tone: "ok" | "warn" | "error"; text: string };

/** What each HTTP status from POST /approve means to the person at the keyboard. */
function describe(err: unknown): Outcome {
  if (!(err instanceof ApiError)) return { tone: "error", text: String(err) };
  if (err.unreachable) return { tone: "error", text: "Antibody API unreachable. Nothing was sent." };
  switch (err.status) {
    case 400:
      return { tone: "error", text: err.message };
    case 404:
      return { tone: "error", text: "Unknown incident." };
    case 409:
      return { tone: "warn", text: `${err.message}. Someone may have already approved (for example by voice); refreshing.` };
    case 502:
      return { tone: "error", text: `Approved, but merge failed: ${err.message}. The approval is recorded; the PR is not merged.` };
    default:
      return { tone: "error", text: `${err.status}: ${err.message}` };
  }
}

/**
 * Approve stays disabled until the text is exactly `approve fix N` for the accepted fix.
 * The console only ever sends what the human typed; it never pre-fills or auto-submits.
 */
export function ApprovalBox({ incidentId, fixId, onDone }: { incidentId: string; fixId: string; onDone: () => void }) {
  const n = fixId.replace(/\D/g, "");
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Once a decision is recorded, lock the form so it can't be submitted twice.
  const [decided, setDecided] = useState(false);

  const typed = phrase.trim();
  const match = APPROVAL_PATTERN.exec(typed);
  const valid = !!match && match[1] === n;
  const hint = !typed ? null : !match ? "Not an approval phrase. Type: approve fix N" : !valid ? `That is not the accepted fix. Type: approve fix ${n}` : null;

  async function run(action: () => Promise<{ data: Resolution }>, okText: (r: Resolution) => string) {
    setBusy(true);
    try {
      const { data } = await action();
      setOutcome({ tone: "ok", text: okText(data) });
      setDecided(true);
    } catch (err) {
      setOutcome(describe(err));
    } finally {
      setBusy(false);
      onDone();
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy || decided) return;
    void run(
      () => approveFix(incidentId, { fix_id: fixId, phrase: typed, channel: "typed" }),
      (r) => `Approved${r.merged ? " and merged" : ""}${r.pr_url ? `: ${r.pr_url}` : ""}${r.merged ? "" : ". Approval recorded; nothing was merged."}`,
    );
  };

  const reject = () => {
    if (!reason.trim() || busy || decided) return;
    void run(
      () => rejectFix(incidentId, { fix_id: fixId, reason: reason.trim() }),
      () => "Rejected. The incident is escalated and nothing was merged.",
    );
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="approval" className="block">
          Type <code className="bg-muted rounded px-1.5 py-0.5 font-mono">approve fix {n}</code> to ship this fix.
        </label>
        <div className="flex gap-3">
          <Input
            id="approval"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="Type: approve fix N"
            autoComplete="off"
            className="h-12 max-w-md font-mono text-lg"
            aria-invalid={!!hint}
            aria-describedby="approval-hint"
            disabled={decided}
          />
          <Button type="submit" disabled={!valid || busy || decided} className="bg-healthy hover:bg-healthy/80 h-12 px-6 text-base text-black">
            {busy ? "Working…" : "Approve"}
          </Button>
        </div>
        <p id="approval-hint" className="text-infected min-h-6 text-base" aria-live="polite">
          {hint}
        </p>
      </form>

      <div className="space-y-3">
        <label htmlFor="reject-reason" className="text-muted-foreground block text-sm">
          Or reject this fix (a reason is required). The incident becomes escalated and nothing is merged.
        </label>
        <div className="flex gap-3">
          <Input
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            autoComplete="off"
            className="h-10 max-w-md"
            disabled={decided}
          />
          <Button type="button" variant="outline" disabled={!reason.trim() || busy || decided} onClick={reject}>
            Reject
          </Button>
        </div>
      </div>

      {outcome && (
        <p
          role="status"
          className={cn(
            "rounded-lg border p-4 font-mono text-sm",
            outcome.tone === "ok" && "border-healthy/40 text-healthy",
            outcome.tone === "warn" && "border-amber-400/40 text-amber-300",
            outcome.tone === "error" && "border-infected/40 text-infected",
          )}
        >
          {outcome.text}
        </p>
      )}
    </div>
  );
}
