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
export const getOperatorHealth = () => USE_MOCK ? mock({ ok: true }) : request<{ ok: boolean }>(ANTIBODY_URL, "/health");
export const getDetectionHealth = () => USE_MOCK ? mock({ ok: true }) : request<{ ok: boolean }>(DETECTION_URL, "/health");
export const getRuns = (limit = 20) => USE_MOCK ? mock((runs as ScoredRun[]).slice(0, limit)) : request<ScoredRun[]>(DETECTION_URL, `/runs?limit=${limit}`);
export const getRisks = () => USE_MOCK ? mock(risks as RiskForecast[]) : request<RiskForecast[]>(ANTIBODY_URL, "/risks");
export const getIncidents = () => USE_MOCK ? mock(samples as Incident[]) : request<Incident[]>(ANTIBODY_URL, "/incidents");
export const getOverview = () => USE_MOCK ? mock(overview as Overview) : request<Overview>(ANTIBODY_URL, "/overview");
export const getAftercare = () => USE_MOCK ? mock(aftercare as Aftercare) : request<Aftercare>(ANTIBODY_URL, "/aftercare");
export const getTrust = () => USE_MOCK ? mock(trust as TrustApi) : request<TrustApi>(ANTIBODY_URL, "/trust");
export const getEvidence = () => USE_MOCK ? mock(evidence as EvidenceApi) : request<EvidenceApi>(ANTIBODY_URL, "/evidence");
export const getEvidenceChecklist = () => request<EvidenceIndex>("", "/evidence/index.json");

export async function getIncident(id: string): Promise<ApiResult<IncidentDetail>> {
  if (!USE_MOCK) return request(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}`);
  const detail = details.find(d => d.incident.id === id);
  if (!detail) throw new ApiError("Unknown incident", 404);
  return mock(detail);
}
export async function getBrief(id: string): Promise<ApiResult<{ text: string }>> {
  if (!USE_MOCK) return request(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/brief`);
  await getIncident(id);
  return mock(id === incident0.incident.id ? brief0 : brief1);
}

export const APPROVAL_PATTERN = /^approve fix \d+$/i;
export async function approveFix(id: string, body: { fix_id: string; phrase: string; channel: "typed" | "voice" }): Promise<ApiResult<Resolution>> {
  if (!USE_MOCK) return request(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(body) });
  if (!APPROVAL_PATTERN.test(body.phrase.trim())) throw new ApiError("Not an approval phrase", 400);
  const { data } = await getIncident(id);
  if (data.incident.status !== "awaiting_approval") throw new ApiError(`Incident is ${data.incident.status}, not awaiting approval`, 409);
  throw new ApiError("Captured samples are read-only; no fix was merged", 409);
}
export async function rejectFix(id: string, body: { fix_id: string; reason: string }): Promise<ApiResult<Resolution>> {
  if (!USE_MOCK) return request(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify(body) });
  await getIncident(id);
  throw new ApiError("Captured samples are read-only; no incident was changed", 409);
}
export async function getGate(): Promise<ApiResult<GateReport | null>> {
  if (USE_MOCK) return mock(gate as GateReport);
  try { return await request<GateReport>(ANTIBODY_URL, "/gate/latest"); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) return { data: null, mock: false };
    throw error;
  }
}
