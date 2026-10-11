import { mockBriefs, mockGate, mockIncidentDetails, mockIncidents, mockRisks } from "@/lib/mock/antibody";
import { mockRuns } from "@/lib/mock/runs";
import type {
  EvidenceIndex,
  GateReport,
  Incident,
  IncidentDetail,
  RiskForecast,
  ScoredRun,
  TrustReport,
} from "@/lib/types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";
const DETECTION_URL = process.env.NEXT_PUBLIC_DETECTION_URL ?? "http://localhost:5050";
const ANTIBODY_URL = process.env.NEXT_PUBLIC_ANTIBODY_URL ?? "http://localhost:4000";

/** Every call returns the data plus whether it came from mock/stub data. */
export interface ApiResult<T> {
  data: T;
  mock: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? body?.detail ?? `HTTP ${res.status}`, res.status);
  return { data: body as T, mock: res.headers.get("x-antibody-mock") === "1" };
}

const mock = <T>(data: T): Promise<ApiResult<T>> => Promise.resolve({ data: structuredClone(data), mock: true });

// Detection API
export const getRuns = (limit = 20) =>
  USE_MOCK ? mock(mockRuns().slice(0, limit)) : request<ScoredRun[]>(DETECTION_URL, `/runs?limit=${limit}`);

export const getRisks = () => (USE_MOCK ? mock(mockRisks()) : request<RiskForecast[]>(ANTIBODY_URL, "/risks"));

// Operator API
export const getIncidents = () => (USE_MOCK ? mock(mockIncidents) : request<Incident[]>(ANTIBODY_URL, "/incidents"));

export async function getIncident(id: string): Promise<ApiResult<IncidentDetail>> {
  if (!USE_MOCK) return request<IncidentDetail>(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}`);
  const detail = mockIncidentDetails[id];
  if (!detail) throw new ApiError("Incident not found", 404);
  return mock(detail);
}

export async function getBrief(id: string): Promise<ApiResult<{ text: string }>> {
  if (!USE_MOCK) return request(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/brief`);
  return mock({ text: mockBriefs[id] ?? "" });
}

/** Contract: phrase must be exactly `approve fix <n>`, trimmed and case-insensitive. */
export const APPROVAL_PATTERN = /^approve fix \d+$/i;

export async function approveFix(id: string, body: { fix_id: string; phrase: string; channel: "typed" | "voice" }) {
  if (!USE_MOCK) return request<unknown>(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(body) });
  if (!APPROVAL_PATTERN.test(body.phrase.trim())) throw new ApiError("Not an approval phrase", 400);
  return mock({ ok: true, incident_id: id, fix_id: body.fix_id, status: "resolved" });
}

export async function rejectFix(id: string, body: { fix_id: string; reason: string }) {
  if (!USE_MOCK) return request<unknown>(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify(body) });
  return mock({ ok: true, incident_id: id, fix_id: body.fix_id });
}

export const getGate = () => (USE_MOCK ? mock(mockGate) : request<GateReport>(ANTIBODY_URL, "/gate/latest"));

// Evidence files (copied from /evidence into public/evidence by `npm run sync-evidence`)
const evidenceFile = async <T>(name: string): Promise<ApiResult<T>> => {
  const res = await fetch(`/evidence/${name}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(`Missing evidence/${name}`, res.status);
  return { data: (await res.json()) as T, mock: false };
};

export const getTrust = () => evidenceFile<TrustReport>("trust.json");
export const getEvidence = () => evidenceFile<EvidenceIndex>("index.json");
