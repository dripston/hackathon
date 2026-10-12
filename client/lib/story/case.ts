// The landing story's case file: Antibody's first real incident (2026-10-11), recorded from the live
// system. Replayed on the landing page and labelled RECORDED; the live console shows current data.
import raw from "./case.json";
import type { GateReport, IncidentDetail, RiskForecast, TrustApi } from "@/lib/types";

export interface CaseRunStep {
  kind: "llm" | "tool";
  name: string;
  error: string | null;
  latency_ms: number | null;
}

export interface CaseRun {
  trace_id: string;
  domain: string;
  started_at: string;
  prompt_version: string;
  steps: CaseRunStep[];
  output: {
    company_name: string | null;
    headcount: number | null;
    summary: string;
    decision_makers: { name: string; title?: string | null }[];
    no_decision_makers_reason: string | null;
    hiring_signals: string[];
  };
  violations: string[];
  evidence: string[];
}

export interface CaseCosts {
  real_incidents: number;
  avg_ledger_cost_usd_real: number | null;
  avg_duration_ms_real: number | null;
}

export interface StoryCase {
  label: "RECORDED";
  note: string;
  incident: IncidentDetail;
  brief: string;
  failing_run: CaseRun;
  gate: GateReport;
  trust: TrustApi;
  forecast: RiskForecast;
  costs: CaseCosts | null;
}

export const STORY = raw as unknown as StoryCase;

export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || "dripston/hackathon";
export const commitUrl = (sha: string) => `https://github.com/${GITHUB_REPO}/commit/${sha}`;
export const short = (sha?: string | null) => (sha ? sha.slice(0, 7) : "—");
