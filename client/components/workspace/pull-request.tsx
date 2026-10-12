"use client";

import { ExternalLink, GitMerge, GitPullRequest, Phone } from "lucide-react";
import { motion } from "motion/react";
import type { LiveEvent } from "@/lib/api";
import type { IncidentDetail } from "@/lib/types";
import { ApprovalBox } from "@/components/console/approval-box";
import { Window } from "@/components/workspace/terminal";
import { cn } from "@/lib/utils";

/** The pull request, GitHub-style: opened when the fix is proven, merged on the engineer's phrase. */
export function PullRequest({ events, detail, onChanged }: { events: LiveEvent[]; detail: IncidentDetail; onChanged: () => void }) {
  const opened = [...events].reverse().find((e) => e.kind === "pr" && (e.action === "opened" || e.action === "local"));
  const merged = events.some((e) => e.kind === "pr" && e.action === "merged") || !!detail.resolution?.merged;
  const res = detail.resolution;
  const waiting = detail.incident.status === "awaiting_approval";
  const approval = res?.approval;
  const number = opened?.url?.split("/").pop();
  const sandbox = opened?.action === "local";

  return (
    <Window title="pull request" className="h-[380px]">
      {!opened ? (
        <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center font-mono text-sm">
          The pull request opens once a fix passes every variant.
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex h-full flex-col overflow-y-auto px-5 py-4">
          <div className="flex items-start gap-3">
            <span className={cn("mt-0.5 rounded-full p-1.5", merged ? "bg-brand/20 text-brand" : "bg-healthy/15 text-healthy")}>
              {merged ? <GitMerge className="size-4" /> : <GitPullRequest className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {opened.title} {number && !sandbox ? <span className="text-muted-foreground font-normal">#{number}</span> : null}
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                <span className="text-foreground/80">{opened.branch}</span> → main
              </p>
            </div>
            <motion.span
              key={merged ? "m" : "o"}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn("rounded-full px-2.5 py-1 text-xs font-medium", merged ? "bg-brand text-background" : "bg-healthy text-background")}
            >
              {merged ? "Merged" : "Open"}
            </motion.span>
          </div>

          <div className="border-border mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border text-center">
            <Stat label="must fix · before" value={res ? `${res.before.must_fix_passed}/${res.before.must_fix_total}` : "—"} tone="bad" />
            <Stat label="must fix · after" value={res?.after ? `${res.after.must_fix_passed}/${res.after.must_fix_total}` : "—"} tone="good" />
            <Stat label="healthy kept" value={res?.after ? `${res.after.must_not_change_passed}/${res.after.must_not_change_total}` : "—"} />
          </div>

          {waiting && (
            <div className="border-brand/30 bg-brand/[0.07] mt-4 rounded-xl border p-4">
              <p className="flex items-center gap-2 text-sm">
                <Phone className="text-brand size-4 animate-pulse" /> Antibody is calling the on-call engineer on Telegram.
              </p>
              {res?.accepted_fix_id && (
                <div className="mt-3">
                  <ApprovalBox incidentId={detail.incident.id} fixId={res.accepted_fix_id} onChanged={onChanged} />
                </div>
              )}
            </div>
          )}
          {approval && (
            <p className="text-muted-foreground mt-4 text-sm">
              <span className="text-brand">{approval.channel === "voice" ? "Approved by voice" : "Approved"}</span>: &ldquo;{approval.phrase}&rdquo; ·{" "}
              {new Date(approval.at).toISOString().slice(11, 16)} UTC{merged ? " · merged" : ""}
            </p>
          )}
          {opened.url && (
            <a href={opened.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground mt-auto inline-flex items-center gap-1.5 pt-4 text-sm">
              Open on GitHub <ExternalLink className="size-3.5" />
            </a>
          )}
          {sandbox && <p className="text-muted-foreground mt-auto pt-4 text-xs">Test incident: merged on the isolated copy only, never pushed to GitHub.</p>}
        </motion.div>
      )}
    </Window>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-background/40 px-3 py-2.5">
      <p className={cn("font-mono text-lg font-semibold", tone === "good" && "text-healthy", tone === "bad" && "text-infected")}>{value}</p>
      <p className="text-muted-foreground text-[11px]">{label}</p>
    </div>
  );
}
