"use client";

import { ANTIBODY_URL, USE_MOCK, getHealth } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";

/** One global banner for mock mode or an unreachable backend, instead of an error on every card. */
export function Banners() {
  const health = usePoll(getHealth, 5000);
  return (
    <>
      {USE_MOCK && (
        <div role="status" className="border-b border-amber-400/40 bg-amber-400/10 px-6 py-2 text-center font-mono text-sm tracking-wider text-amber-300">
          MOCK DATA: every page is rendered from recorded sample responses, not the live backend
        </div>
      )}
      {health.unreachable && (
        <div role="alert" className="border-infected/40 bg-infected/10 text-infected border-b px-6 py-2 text-center font-mono text-sm">
          Antibody API unreachable at {ANTIBODY_URL}. Showing the last data received; retrying.
        </div>
      )}
    </>
  );
}
