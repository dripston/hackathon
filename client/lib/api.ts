import samples from "@/lib/mock/samples/incidents.json";
import incident0 from "@/lib/mock/samples/incident_0.json";
import incident1 from "@/lib/mock/samples/incident_1.json";
import brief0 from "@/lib/mock/samples/incident_0_brief.json";
import brief1 from "@/lib/mock/samples/incident_1_brief.json";
import runs from "@/lib/mock/samples/detection_runs.json";
import risks from "@/lib/mock/samples/risks.json";
import gate from "@/lib/mock/samples/gate_latest.json";
import overview from "@/lib/mock/samples/overview.json";
import aftercare from "@/lib/mock/samples/aftercare.json";
import trust from "@/lib/mock/samples/trust.json";
import evidence from "@/lib/mock/samples/evidence.json";
import type { Aftercare, EvidenceApi, EvidenceIndex, GateReport, Incident, IncidentDetail, Overview, Resolution, RiskForecast, ScoredRun, TrustApi } from "@/lib/types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";
export const DETECTION_URL = process.env.NEXT_PUBLIC_DETECTION_URL || "/api/detection";
export const ANTIBODY_URL = process.env.NEXT_PUBLIC_ANTIBODY_URL || "/api/antibody";

// While a live drill runs, mission control reads the drill's own patient and Antibody (a sandbox with a real
// bug); otherwise the production ones. Switched by the console layout from GET /drill/status.
const DRILL_ANTIBODY_URL = "/api/drill/antibody";
const DRILL_DETECTION_URL = "/api/drill/detection";
let drillMode = false;
export const setDrillMode = (on: boolean) => { drillMode = on; };
export const isDrillMode = () => drillMode;
const ab = () => (drillMode ? DRILL_ANTIBODY_URL : ANTIBODY_URL);
const det = () => (drillMode ? DRILL_DETECTION_URL : DETECTION_URL);

export interface ApiResult<T> { data: T; mock: boolean }
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const message = body?.error ?? (Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg ?? "Invalid input").join("; ")
      : typeof detail === "string" ? detail : `HTTP ${res.status}`);
    throw new ApiError(message, res.status);
  }
  if (body === null) throw new ApiError("Backend returned an invalid JSON response", res.status);
  return { data: body as T, mock: res.headers.get("x-antibody-mock") === "1" };
}

const mock = <T>(data: T): Promise<ApiResult<T>> => Promise.resolve({ data: structuredClone(data), mock: true });
// Captured API samples are only used when mock mode is explicitly enabled.
const details = [incident0, incident1] as IncidentDetail[];
export const getOperatorHealth = () => USE_MOCK ? mock({ ok: true }) : request<{ ok: boolean }>(ab(), "/health");
export const getDetectionHealth = () => USE_MOCK ? mock({ ok: true }) : request<{ ok: boolean }>(det(), "/health");
export const getRuns = (limit = 20) => USE_MOCK ? mock((runs as ScoredRun[]).slice(0, limit)) : request<ScoredRun[]>(det(), `/runs?limit=${limit}`);
export const getRisks = () => USE_MOCK ? mock(risks as RiskForecast[]) : request<RiskForecast[]>(ab(), "/risks");
export const getIncidents = () => USE_MOCK ? mock(samples as Incident[]) : request<Incident[]>(ab(), "/incidents");
export const getOverview = () => USE_MOCK ? mock(overview as Overview) : request<Overview>(ab(), "/overview");
export const getAftercare = () => USE_MOCK ? mock(aftercare as Aftercare) : request<Aftercare>(ab(), "/aftercare");
export const getTrust = () => USE_MOCK ? mock(trust as TrustApi) : request<TrustApi>(ab(), "/trust");
export const getEvidence = () => USE_MOCK ? mock(evidence as EvidenceApi) : request<EvidenceApi>(ab(), "/evidence");
export const getEvidenceChecklist = () => request<EvidenceIndex>("", "/evidence/index.json");

export interface SystemReady { ok: boolean; modules: Record<string, string>; watcher: string }
/** Gateway readiness (detection, antibody, voice, watcher). A 503 still carries the report. */
export async function getSystem(): Promise<ApiResult<SystemReady>> {
  if (USE_MOCK) return mock({ ok: true, modules: { detection: "connected", antibody: "connected", voice: "connected" }, watcher: "running" });
  const res = await fetch("/api/system/ready", { cache: "no-store", signal: AbortSignal.timeout(10000) });
  const body = await res.json().catch(() => null);
  if (!body?.modules) throw new ApiError(`HTTP ${res.status}`, res.status);
  return { data: body as SystemReady, mock: false };
}

export async function getIncident(id: string): Promise<ApiResult<IncidentDetail>> {
  if (!USE_MOCK) return request(ab(), `/incidents/${encodeURIComponent(id)}`);
  const detail = details.find(d => d.incident.id === id);
  if (!detail) throw new ApiError("Unknown incident", 404);
  return mock(detail);
}
export async function getBrief(id: string): Promise<ApiResult<{ text: string }>> {
  if (!USE_MOCK) return request(ab(), `/incidents/${encodeURIComponent(id)}/brief`);
  await getIncident(id);
  return mock(id === incident0.incident.id ? brief0 : brief1);
}

export const APPROVAL_PATTERN = /^approve fix \d+$/i;
export async function approveFix(id: string, body: { fix_id: string; phrase: string; channel: "typed" | "voice" }): Promise<ApiResult<Resolution>> {
  if (!USE_MOCK) return request(ab(), `/incidents/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(body) });
  if (!APPROVAL_PATTERN.test(body.phrase.trim())) throw new ApiError("Not an approval phrase", 400);
  const { data } = await getIncident(id);
  if (data.incident.status !== "awaiting_approval") throw new ApiError(`Incident is ${data.incident.status}, not awaiting approval`, 409);
  throw new ApiError("Captured samples are read-only; no fix was merged", 409);
}
export async function rejectFix(id: string, body: { fix_id: string; reason: string }): Promise<ApiResult<Resolution>> {
  if (!USE_MOCK) return request(ab(), `/incidents/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify(body) });
  await getIncident(id);
  throw new ApiError("Captured samples are read-only; no incident was changed", 409);
}
export async function getGate(): Promise<ApiResult<GateReport | null>> {
  if (USE_MOCK) return mock(gate as GateReport);
  try { return await request<GateReport>(ab(), "/gate/latest"); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) return { data: null, mock: false };
    throw error;
  }
}


export interface DrillStatus {
  state: "idle" | "starting" | "deploying" | "traffic" | "detecting" | "fixing" | "awaiting_approval" | "verifying" | "done" | "expired" | "failed";
  message?: string;
  running?: boolean;
  ended?: boolean;
  started_at?: string;
  updated_at?: string;
  incident_id?: string | null;
  silent_failures?: number;
  bug_commit?: string;
}
/** The drill always lives on the production Antibody API, whatever the current source. */
export const getDrill = () => (USE_MOCK ? mock({ state: "idle", running: false } as DrillStatus) : request<DrillStatus>(ANTIBODY_URL, "/drill/status"));
export async function stopDrill() {
  return request<{ stopped: boolean }>(ANTIBODY_URL, "/drill/stop", { method: "POST", body: "{}" });
}
export async function startDrill() {
  if (USE_MOCK) throw new ApiError("Drills need the live backend", 409);
  return request<{ started: boolean }>(ANTIBODY_URL, "/drill/start", { method: "POST", body: "{}" });
}
/** One live step from Antibody (see antibody/antibody/events.py). */
export interface LiveEvent {
  seq: number;
  ts: string;
  kind: "stage" | "cmd" | "note" | "scenario" | "verdict" | "llm" | "code" | "pr";
  // stage
  stage?: string;
  status?: "start" | "done";
  text?: string;
  // cmd
  cmd?: string;
  out?: string;
  // note
  tone?: "good" | "bad";
  // scenario / verdict
  id?: string;
  role?: "must_fix" | "must_not_change";
  domain?: string;
  fault?: string | null;
  candidate?: string;
  scenario_id?: string;
  passed?: boolean;
  failed_checks?: string[];
  // llm
  purpose?: string;
  model?: string | null;
  // code
  file?: string;
  attempt?: number;
  fix_id?: string;
  description?: string;
  diff?: string;
  // pr
  action?: "opened" | "merged" | "local";
  url?: string | null;
  branch?: string;
  title?: string;
  body?: string;
}
export const getEvents = (id: string, after = 0) =>
  USE_MOCK ? mock({ events: [] as LiveEvent[], next: after }) : request<{ events: LiveEvent[]; next: number }>(ab(), `/incidents/${encodeURIComponent(id)}/events?after=${after}`);
