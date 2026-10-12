"use client";

import { ANTIBODY_URL, DETECTION_URL, USE_MOCK, getAftercare, getDetectionHealth, getOperatorHealth } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { MockBadge } from "./ui";

export function BackendStatus() {
  const operator = usePoll(getOperatorHealth, 10000);
  const detection = usePoll(getDetectionHealth, 10000);
  const aftercare = usePoll(getAftercare, 3000);
  const job = aftercare.data;
  return <div className="mx-auto max-w-[1800px] space-y-2 px-6 pt-3" aria-live="polite">
    {USE_MOCK && <p className="rounded border border-amber-400/50 p-3 font-mono text-amber-300">MOCK DATA · captured API samples · read-only</p>}
    {operator.error && <p role="alert" className="text-infected">Antibody API unreachable at {ANTIBODY_URL}. Retrying; previously loaded data may be stale.</p>}
    {detection.error && <p role="alert" className="text-infected">Detection API unreachable at {DETECTION_URL}. Retrying.</p>}
    {job && job.state !== "idle" && <p className={job.state === "failed" ? "text-infected" : "text-muted-foreground"}>
      <MockBadge show={aftercare.mock} /> Post-merge checks: {job.state}
      {job.gate_verdict && ` · gate ${job.gate_verdict}`}
      {job.error && ` · ${job.error}`}
      {aftercare.error && " · status stale, retrying"}
    </p>}
  </div>;
}
