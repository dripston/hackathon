"use client";

import { useState } from "react";
import { APPROVAL_PATTERN, ApiError, approveFix, rejectFix } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MockBadge } from "./ui";

export function ApprovalBox({ incidentId, fixId, onChanged }: { incidentId: string; fixId: string; onChanged: () => void }) {
  const expected = `approve fix ${fixId.replace(/^fix_/, "")}`;
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [response, setResponse] = useState<{ ok: boolean; text: string; mock?: boolean } | null>(null);
  const typed = phrase.trim();
  const valid = APPROVAL_PATTERN.test(typed) && typed.toLowerCase() === expected;
  const hint = !typed || valid || expected.startsWith(typed.toLowerCase()) ? null : `Not an approval phrase for this fix. Type: ${expected}`;

  async function decide(action: "approve" | "reject") {
    if (busy || completed || (action === "approve" ? !valid : !reason.trim())) return;
    setBusy(true);
    try {
      const result = action === "approve"
        ? await approveFix(incidentId, { fix_id: fixId, phrase: typed, channel: "typed" })
        : await rejectFix(incidentId, { fix_id: fixId, reason: reason.trim() });
      setResponse({ ok: true, mock: result.mock, text: JSON.stringify(result.data, null, 2) });
      setCompleted(true);
      onChanged();
    } catch (error) {
      setResponse({ ok: false, text: error instanceof ApiError ? `${error.status}: ${error.message}` : String(error) });
      if (error instanceof ApiError && error.status === 409) onChanged();
    } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <form onSubmit={e => { e.preventDefault(); void decide("approve"); }} className="space-y-3">
      <label htmlFor="approval" className="block">Type <code className="font-mono">{expected}</code> to approve this fix.</label>
      <div className="flex flex-wrap gap-3">
        <Input id="approval" value={phrase} onChange={e => setPhrase(e.target.value)} placeholder={`Type: ${expected}`} autoComplete="off" className="h-12 max-w-md font-mono text-lg" aria-invalid={!!hint} aria-describedby="approval-hint" disabled={busy || completed} />
        <Button type="submit" disabled={!valid || busy || completed} className="bg-healthy hover:bg-healthy/80 h-12 text-black">{busy ? "Sending…" : "Approve"}</Button>
      </div>
      <p id="approval-hint" className="text-infected min-h-6" aria-live="polite">{hint}</p>
    </form>
    <form onSubmit={e => { e.preventDefault(); void decide("reject"); }} className="space-y-2">
      <label htmlFor="rejection-reason">Reason for rejection</label>
      <div className="flex flex-wrap gap-3">
        <Input id="rejection-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why this fix needs more work" required disabled={busy || completed} className="max-w-md" />
        <Button type="submit" variant="outline" disabled={!reason.trim() || busy || completed}>Reject fix</Button>
      </div>
    </form>
    {response && <div role="status"><MockBadge show={!!response.mock} /><pre className={`overflow-x-auto rounded-lg border p-4 font-mono text-sm ${response.ok ? "text-healthy" : "text-infected"}`}>{response.text}</pre></div>}
  </div>;
}
