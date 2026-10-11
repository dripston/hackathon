"use client";

import { useState } from "react";
import { APPROVAL_PATTERN, ApiError, approveFix } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Approve stays disabled until the text is exactly `approve fix <n>` for the pending fix. */
export function ApprovalBox({ incidentId, fixId, onApproved }: { incidentId: string; fixId: string; onApproved: () => void }) {
  const n = fixId.replace(/\D/g, "");
  const expected = `approve fix ${n}`;
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<{ ok: boolean; text: string } | null>(null);

  const typed = phrase.trim();
  const valid = APPROVAL_PATTERN.test(typed) && typed.toLowerCase() === expected;
  const typingTowards = expected.startsWith(typed.toLowerCase());
  const hint = !typed || typingTowards
    ? null
    : APPROVAL_PATTERN.test(typed)
      ? `That's not the pending fix. Type "${expected}".`
      : "Not an approval phrase.";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const { data } = await approveFix(incidentId, { fix_id: fixId, phrase: typed, channel: "typed" });
      setResponse({ ok: true, text: JSON.stringify(data, null, 2) });
      onApproved();
    } catch (err) {
      setResponse({ ok: false, text: err instanceof ApiError ? `${err.status}: ${err.message}` : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="approval" className="block">
        Type <code className="bg-muted rounded px-1.5 py-0.5 font-mono">{expected}</code> to ship this fix.
      </label>
      <div className="flex gap-3">
        <Input
          id="approval"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={expected}
          autoComplete="off"
          className="h-12 max-w-md font-mono text-lg"
          aria-invalid={!!hint}
          aria-describedby="approval-hint"
        />
        <Button type="submit" disabled={!valid || busy} className="bg-healthy hover:bg-healthy/80 h-12 px-6 text-base text-black">
          {busy ? "Approving…" : "Approve"}
        </Button>
      </div>
      <p id="approval-hint" className="text-infected min-h-6 text-base" aria-live="polite">
        {hint}
      </p>
      {response && (
        <pre
          className={cn(
            "overflow-x-auto rounded-lg border p-4 font-mono text-sm",
            response.ok ? "border-healthy/40 text-healthy" : "border-infected/40 text-infected",
          )}
        >
          {response.text}
        </pre>
      )}
    </form>
  );
}
