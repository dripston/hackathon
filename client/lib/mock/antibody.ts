import type {
  FamilyResult,
  FixAttempt,
  GateReport,
  Incident,
  IncidentDetail,
  RiskForecast,
  Scenario,
  Verdict,
} from "@/lib/types";

const RESOLVED = "inc_20261011_1420_tw_invented_person";
const OPEN = "inc_20261011_1702_tw_empty_after_error";

export const mockIncidents: Incident[] = [
  {
    id: OPEN,
    detection: "tw_empty_after_error",
    trace_ids: ["nl_tr_5f3c3d", "nl_tr_5f4b2c"],
    workflow: "company-research",
    first_seen: "2026-10-11T17:02:00Z",
    status: "awaiting_approval",
  },
  {
    id: RESOLVED,
    detection: "tw_invented_person",
    trace_ids: ["nl_tr_5f3e70", "nl_tr_5f5591", "nl_tr_5f61ab"],
    workflow: "company-research",
    first_seen: "2026-10-11T14:20:00Z",
    status: "resolved",
  },
];

function scenarios(incidentId: string, fixDomains: string[], keepDomains: string[], check: string): Scenario[] {
  const make = (role: Scenario["role"], domain: string, i: number): Scenario => ({
    id: `sc_${role === "must_fix" ? "f" : "k"}${i + 1}_${incidentId.slice(-6)}`,
    incident_id: incidentId,
    role,
    domain,
    faults:
      role === "must_fix"
        ? [
            {
              tool: "crustdata.people_search",
              at_call: 1,
              error: i % 3 === 0 ? { code: "EMPTY", message: "no results" } : i % 3 === 1 ? { code: "HTTP_429", message: "rate limited" } : { code: "TIMEOUT", message: "timed out" },
            },
          ]
        : [],
    cassette_set: "base",
    expected_checks: role === "must_fix" ? [check] : [],
  });
  return [...fixDomains.map((d, i) => make("must_fix", d, i)), ...keepDomains.map((d, i) => make("must_not_change", d, i))];
}

function family(incidentId: string, candidate: string, sc: Scenario[], failing: Set<string>, check: string): FamilyResult {
  const verdicts: Verdict[] = sc.map((s, i) => ({
    scenario_id: s.id,
    passed: !failing.has(s.id),
    failed_checks: failing.has(s.id) ? [s.role === "must_fix" ? check : "tw_claimed_success_on_failure"] : [],
    run_id: `run_sim_${candidate}_${i}`,
    trace_id: `nl_tr_sim_${candidate}_${i}`,
    synthetic_tool_calls: 0,
  }));
  const pick = (role: Scenario["role"]) => sc.filter((s) => s.role === role);
  const passed = (role: Scenario["role"]) => pick(role).filter((s) => !failing.has(s.id)).length;
  return {
    incident_id: incidentId,
    candidate,
    must_fix_passed: passed("must_fix"),
    must_fix_total: pick("must_fix").length,
    must_not_change_passed: passed("must_not_change"),
    must_not_change_total: pick("must_not_change").length,
    verdicts,
  };
}

// Resolved incident: baseline 3/7, fix_1 rejected (broke a neighbour), fix_2 accepted 7/7 + 4/4.
const rSc = scenarios(
  RESOLVED,
  ["acme-robotics.io", "northwind.dev", "globex.ai", "initech.co", "hooli.xyz", "umbrella.bio", "stark.energy"],
  ["stripe.com", "linear.app", "notion.so", "vercel.com"],
  "tw_invented_person",
);
const f = (n: number) => rSc[n].id;
const rBaseline = family(RESOLVED, "baseline", rSc, new Set([f(0), f(2), f(3), f(5)]), "tw_invented_person");
const rFix1 = family(RESOLVED, "fix_1", rSc, new Set([f(9)]), "tw_invented_person");
const rFix2 = family(RESOLVED, "fix_2", rSc, new Set(), "tw_invented_person");

const rFixes: FixAttempt[] = [
  {
    id: "fix_1",
    verdict: "rejected",
    reason: "Broke must_not_change notion.so: the agent now refuses to name anyone when people_search returns fewer than 3 results.",
    diff: `--- a/prompts/v2.md
+++ b/prompts/v2.md
@@ -14,7 +14,8 @@ ## Decision makers
-Every brief must include at least 3 decision makers.
+Only name people returned by crustdata.people_search.
+If fewer than 3 people are returned, return no decision makers.`,
  },
  {
    id: "fix_2",
    verdict: "accepted",
    reason: null,
    diff: `--- a/prompts/v2.md
+++ b/prompts/v2.md
@@ -14,7 +14,9 @@ ## Decision makers
-Every brief must include at least 3 decision makers.
+List up to 3 decision makers, and only people returned by crustdata.people_search.
+Cite the source step index for each person.
+If fewer are found, list the ones found and set no_decision_makers_reason.`,
  },
];

// Open incident: baseline 2/6, fix_1 passes 6/6 + 4/4, waiting for approval.
const oSc = scenarios(
  OPEN,
  ["contoso.com", "fabrikam.io", "tailspin.dev", "wingtip.ai", "adventure.works", "litware.co"],
  ["stripe.com", "figma.com", "ramp.com", "plaid.com"],
  "tw_empty_after_error",
);
const oBaseline = family(OPEN, "baseline", oSc, new Set([oSc[0].id, oSc[1].id, oSc[3].id, oSc[4].id]), "tw_empty_after_error");
const oFix1 = family(OPEN, "fix_1", oSc, new Set(), "tw_empty_after_error");

export const mockIncidentDetails: Record<string, IncidentDetail> = {
  [RESOLVED]: {
    incident: mockIncidents[1],
    diagnosis: {
      incident_id: RESOLVED,
      commit_sha: "8c1f2a9d4b7e6f0a3c5d8e1f2a4b6c8d0e2f4a6b",
      checkpoint_id: "ckpt_7Hq2Lm",
      checkpoint_url: "https://entire.io/gh/shresthjindal28/hackathon/commit/8c1f2a9d4b7e6f0a3c5d8e1f2a4b6c8d0e2f4a6b",
      reasoning_excerpt:
        "Sales says briefs with fewer than 3 contacts are useless. Update the prompt so every brief includes at least 3 decision makers.",
      good_trace_ids: ["nl_tr_5f2a11", "nl_tr_5f2b07"],
      explanation:
        "Prompt v2 added a hard rule of 3 decision makers. When people search returns fewer, the model fills the gap with plausible invented names. Healthy runs before the change named only returned people.",
      fix_kind: "prompt_patch",
    },
    families: [rBaseline, rFix1, rFix2],
    resolution: {
      incident_id: RESOLVED,
      accepted_fix_id: "fix_2",
      before: rBaseline,
      after: rFix2,
      attempts: ["fix_1", "fix_2"],
      pr_url: "https://github.com/shresthjindal28/hackathon/pull/42",
      cost_usd: 0.42,
      duration_ms: 184_000,
      approval: { phrase: "approve fix 2", channel: "voice", at: "2026-10-11T14:31:12Z" },
    },
    scenarios: rSc,
    fixes: rFixes,
  },
  [OPEN]: {
    incident: mockIncidents[0],
    diagnosis: {
      incident_id: OPEN,
      commit_sha: "3e9b7c1a5f2d8e4b6a0c9d7e5f3a1b8c6d4e2f0a",
      checkpoint_id: "ckpt_9Rt4Wx",
      checkpoint_url: "https://entire.io/gh/shresthjindal28/hackathon/commit/3e9b7c1a5f2d8e4b6a0c9d7e5f3a1b8c6d4e2f0a",
      reasoning_excerpt:
        "Tool errors make the brief look broken. Catch them and keep going so the user always gets a clean answer.",
      good_trace_ids: ["nl_tr_5f1d90"],
      explanation:
        "Errors from people_search are now swallowed. A rate limit or timeout becomes an empty list, and the brief reports 'no decision makers found' as if it were a fact.",
      fix_kind: "code_patch",
    },
    families: [oBaseline, oFix1],
    resolution: null,
    scenarios: oSc,
    fixes: [
      {
        id: "fix_1",
        verdict: "pending",
        reason: null,
        diff: `--- a/patient/tools/crustdata.py
+++ b/patient/tools/crustdata.py
@@ -41,8 +41,9 @@ def people_search(domain, titles):
     try:
         return client.people(domain=domain, titles=titles)
-    except ToolError:
-        return []
+    except ToolError as err:
+        # Surface the failure so the brief can say the lookup failed.
+        raise ToolUnavailable(err.code) from err`,
      },
    ],
  },
};

export const mockBriefs: Record<string, string> = {
  [RESOLVED]:
    "The research agent was naming decision makers who appear in no search result. It started with prompt v2, which demanded at least 3 contacts per brief. Fix 2 limits names to people actually returned and cites their source. It passes 7 of 7 failing variants and keeps all 4 healthy cases unchanged.",
  [OPEN]:
    "The research agent reports 'no decision makers found' when the people search was rate-limited or timed out. A recent change swallows tool errors. Fix 1 surfaces the error instead. It passes 6 of 6 failing variants and keeps all 4 healthy cases unchanged. Say 'approve fix 1' to ship it.",
};

export function mockRisks(now = Date.now()): RiskForecast[] {
  return [
    {
      id: "risk_people_search_errors",
      signal: "tool_error_rate",
      subject: "crustdata.people_search",
      current: 0.09,
      threshold: 0.15,
      trend_per_hour: 0.06,
      eta_minutes: 20,
      likelihood: "likely",
      related_check: "tw_empty_after_error",
      evidence: "People search errors rose from 2% to 9% in the last hour",
      created_at: new Date(now - 6 * 60_000).toISOString(),
      outcome: "pending",
    },
    {
      id: "risk_grounding_drift",
      signal: "near_miss",
      subject: "jev_grounded",
      current: 0.64,
      threshold: 0.6,
      trend_per_hour: -0.05,
      eta_minutes: null,
      likelihood: "likely",
      related_check: "tw_invented_person",
      evidence: "Grounding scores slid from 0.91 to 0.64 after prompt v2",
      created_at: "2026-10-11T13:55:00Z",
      outcome: "happened",
    },
    {
      id: "risk_latency_p95",
      signal: "latency_p95",
      subject: "crustdata.company_enrich",
      current: 1.9,
      threshold: 3,
      trend_per_hour: 0.2,
      eta_minutes: 330,
      likelihood: "possible",
      related_check: null,
      evidence: "p95 latency up from 1.2s to 1.9s since morning",
      created_at: new Date(now - 40 * 60_000).toISOString(),
      outcome: "pending",
    },
  ];
}

export const mockGate: GateReport = {
  branch: "feature/shorter-brief-prompt",
  verdict: "blocked",
  families: [
    { incident_id: RESOLVED, must_fix_passed: 4, must_fix_total: 7, reopens: true },
    { incident_id: OPEN, must_fix_passed: 6, must_fix_total: 6, reopens: false },
  ],
  created_at: "2026-10-11T18:05:00Z",
};
