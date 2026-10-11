import aftercareSample from "@/lib/mock/samples/aftercare.json";
import evidenceSample from "@/lib/mock/samples/evidence.json";
import gateSample from "@/lib/mock/samples/gate_latest.json";
import incident0 from "@/lib/mock/samples/incident_0.json";
import incident0Brief from "@/lib/mock/samples/incident_0_brief.json";
import incident1 from "@/lib/mock/samples/incident_1.json";
import incident1Brief from "@/lib/mock/samples/incident_1_brief.json";
import incidentsSample from "@/lib/mock/samples/incidents.json";
import overviewSample from "@/lib/mock/samples/overview.json";
import risksSample from "@/lib/mock/samples/risks.json";
import runsSample from "@/lib/mock/samples/detection_runs.json";
import trustSample from "@/lib/mock/samples/trust.json";
import type {
  Aftercare,
  EvidenceApi,
  EvidenceIndex,
  GateReport,
  Incident,
  IncidentDetail,
  Overview,
  Resolution,
  RiskForecast,
  ScoredRun,
  TrustApi,
} from "@/lib/types";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";
export const DETECTION_URL = process.env.NEXT_PUBLIC_DETECTION_URL ?? "http://localhost:5050";
export const ANTIBODY_URL = process.env.NEXT_PUBLIC_ANTIBODY_URL ?? "http://localhost:4000";
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "";

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
  /** status 0 = the request never reached a server (backend down, blocked, offline). */
  get unreachable() {
    return this.status === 0;
  }
}

/** Antibody sends `{ error }`; FastAPI validation sends `{ detail: [{ msg }] }`. */
function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const { error, detail } = body as { error?: unknown; detail?: unknown };
    if (typeof error === "string") return error;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msgs = detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)));
      if (msgs.length) return msgs.join("; ");
    }
  }
  return `HTTP ${status}`;
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Cannot reach ${base}`, 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorMessage(body, res.status), res.status);
  return { data: body as T, mock: res.headers.get("x-antibody-mock") === "1" };
}

const mock = <T>(data: T): Promise<ApiResult<T>> => Promise.resolve({ data: structuredClone(data), mock: true });

// The samples are real API responses; JSON imports are widened (e.g. status: string), so narrow them once here.
const asType = <T>(sample: unknown) => sample as T;

// Mock-mode only: a copy of the real second incident, rewound to "awaiting approval", so the approval box can be tried.
const MOCK_AWAITING_ID = "inc_mock_awaiting_approval";
const mockAwaiting = (): IncidentDetail => {
  const base = asType<IncidentDetail>(incident1);
  return {
    ...base,
    incident: { ...base.incident, id: MOCK_AWAITING_ID, status: "awaiting_approval" },
    resolution: base.resolution && {
      ...base.resolution,
      incident_id: MOCK_AWAITING_ID,
      approval: null,
      merged: false,
      pr_url: null,
    },
  };
};
const mockDetails = (): Record<string, IncidentDetail> => {
  const a = asType<IncidentDetail>(incident0);
  const b = asType<IncidentDetail>(incident1);
  const c = mockAwaiting();
  return { [a.incident.id]: a, [b.incident.id]: b, [c.incident.id]: c };
};

// ---- Detection API --------------------------------------------------------------------------

export const getRuns = (limit = 20) =>
  USE_MOCK ? mock(asType<ScoredRun[]>(runsSample).slice(0, limit)) : request<ScoredRun[]>(DETECTION_URL, `/runs?limit=${limit}`);

// ---- Operator API ---------------------------------------------------------------------------

/** Plain reachability check for the global "unreachable" banner. */
export const getHealth = () => (USE_MOCK ? mock({ ok: true }) : request<{ ok: boolean }>(ANTIBODY_URL, "/health"));

export const getOverview = () => (USE_MOCK ? mock(asType<Overview>(overviewSample)) : request<Overview>(ANTIBODY_URL, "/overview"));

export const getRisks = () => (USE_MOCK ? mock(asType<RiskForecast[]>(risksSample)) : request<RiskForecast[]>(ANTIBODY_URL, "/risks"));

export const getIncidents = () =>
  USE_MOCK
    ? mock([mockAwaiting().incident, ...asType<Incident[]>(incidentsSample)])
    : request<Incident[]>(ANTIBODY_URL, "/incidents");

export async function getIncident(id: string): Promise<ApiResult<IncidentDetail>> {
  if (!USE_MOCK) return request<IncidentDetail>(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}`);
  const detail = mockDetails()[id];
  if (!detail) throw new ApiError("Unknown incident", 404);
  return mock(detail);
}

export async function getBrief(id: string): Promise<ApiResult<{ text: string }>> {
  if (!USE_MOCK) return request(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/brief`);
  const briefs: Record<string, { text: string }> = {
    [asType<IncidentDetail>(incident0).incident.id]: incident0Brief,
    [asType<IncidentDetail>(incident1).incident.id]: incident1Brief,
    [MOCK_AWAITING_ID]: incident1Brief,
  };
  const brief = briefs[id];
  if (!brief) throw new ApiError("Unknown incident", 404);
  return mock(brief);
}

/** The phrase must be exactly `approve fix <n>`, trimmed and case-insensitive. */
export const APPROVAL_PATTERN = /^approve fix (\d+)$/i;

export async function approveFix(id: string, body: { fix_id: string; phrase: string; channel: "typed" | "voice" }) {
  if (!USE_MOCK) {
    return request<Resolution>(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  if (!APPROVAL_PATTERN.test(body.phrase.trim())) throw new ApiError("Not an approval phrase", 400);
  const resolution = mockAwaiting().resolution;
  if (!resolution) throw new ApiError("Unknown incident", 404);
  return mock<Resolution>({
    ...resolution,
    approval: { phrase: body.phrase.trim(), channel: body.channel, at: new Date().toISOString() },
    merged: true,
    pr_url: asType<IncidentDetail>(incident1).resolution?.pr_url ?? null,
  });
}

export async function rejectFix(id: string, body: { fix_id: string; reason: string }) {
  if (!USE_MOCK) {
    return request<Resolution>(ANTIBODY_URL, `/incidents/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  const resolution = mockAwaiting().resolution;
  if (!resolution) throw new ApiError("Unknown incident", 404);
  return mock<Resolution>({ ...resolution, rejection: { fix_id: body.fix_id, reason: body.reason, at: new Date().toISOString() } });
}

/** `data` is null until the first gate run (the API answers 404 "No gate report yet"). */
export async function getGate(): Promise<ApiResult<GateReport | null>> {
  if (USE_MOCK) return mock(asType<GateReport>(gateSample));
  try {
    return await request<GateReport>(ANTIBODY_URL, "/gate/latest");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { data: null, mock: false };
    throw err;
  }
}

export const getAftercare = () => (USE_MOCK ? mock(asType<Aftercare>(aftercareSample)) : request<Aftercare>(ANTIBODY_URL, "/aftercare"));

export const getEvidenceApi = () =>
  USE_MOCK ? mock(asType<EvidenceApi>(evidenceSample)) : request<EvidenceApi>(ANTIBODY_URL, "/evidence");

const EMPTY_TRUST: TrustApi = {
  status: "not_measured_yet",
  label: "",
  seeded_label: "",
  created_at: null,
  seeded_bugs: [],
  would_have_blocked: 0,
  catch_rate: null,
  misses: [],
  false_alarm_rate: null,
  false_alarm_checks: 0,
  false_alarms: 0,
  families: [],
};

export type TrustView = TrustApi & { snapshot: boolean };

/** Live `/trust`; if the API is unreachable, falls back to the committed snapshot in evidence/trust.json. */
export async function getTrust(): Promise<ApiResult<TrustView>> {
  if (USE_MOCK) {
    const r = await mock(asType<TrustApi>(trustSample));
    return { ...r, data: { ...r.data, snapshot: false } };
  }
  try {
    const r = await request<TrustApi>(ANTIBODY_URL, "/trust");
    return { ...r, data: { ...r.data, snapshot: false } };
  } catch (err) {
    if (!(err instanceof ApiError && err.unreachable)) throw err;
    const snap = await evidenceFile<Partial<TrustApi>>("trust.json");
    return { data: { ...EMPTY_TRUST, ...snap.data, snapshot: true }, mock: false };
  }
}

// Evidence files (copied from /evidence into public/evidence by `npm run sync-evidence`)
async function evidenceFile<T>(name: string): Promise<ApiResult<T>> {
  const res = await fetch(`/evidence/${name}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(`Missing evidence/${name}`, res.status);
  return { data: (await res.json()) as T, mock: false };
}

export const getEvidence = () => evidenceFile<EvidenceIndex>("index.json");
