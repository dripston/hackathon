import type { CheckResult, DecisionMaker, ScoredRun } from "@/lib/types";

const CHECK_IDS = [
  "tw_invented_person",
  "tw_empty_after_error",
  "tw_company_match_skipped",
  "tw_claimed_success_on_failure",
  "jev_grounded",
];

const COMPANIES: [string, string, number][] = [
  ["stripe.com", "Stripe", 8000],
  ["notion.so", "Notion", 900],
  ["linear.app", "Linear", 120],
  ["vercel.com", "Vercel", 650],
  ["figma.com", "Figma", 1600],
  ["ramp.com", "Ramp", 1100],
  ["retool.com", "Retool", 450],
  ["airtable.com", "Airtable", 1000],
  ["plaid.com", "Plaid", 1200],
  ["datadoghq.com", "Datadog", 6000],
  ["brex.com", "Brex", 1100],
  ["gusto.com", "Gusto", 2500],
  ["miro.com", "Miro", 1800],
  ["canva.com", "Canva", 4000],
  ["rippling.com", "Rippling", 3000],
  ["deel.com", "Deel", 4000],
  ["mercury.com", "Mercury", 800],
  ["posthog.com", "PostHog", 70],
  ["supabase.com", "Supabase", 130],
  ["clerk.com", "Clerk", 90],
];

const PEOPLE = [
  ["Maya Chen", "VP Sales"],
  ["Daniel Okafor", "Head of Revenue Operations"],
  ["Sofia Martins", "Director of Partnerships"],
  ["Arjun Mehta", "Chief Revenue Officer"],
];

// Seeded silent failures: which run index fails which check, and the evidence sentence.
const FAILURES: Record<number, { id: string; evidence: string; invented?: [string, string] }> = {
  2: {
    id: "tw_invented_person",
    evidence: "'Priya Sharma, VP Sales' appears in no people-search result",
    invented: ["Priya Sharma", "VP Sales"],
  },
  6: {
    id: "tw_empty_after_error",
    evidence: "people_search returned HTTP_429 at step 2; brief reports 'no decision makers found'",
  },
  11: {
    id: "tw_invented_person",
    evidence: "'Rahul Verma, Head of Growth' appears in no people-search result",
    invented: ["Rahul Verma", "Head of Growth"],
  },
  15: {
    id: "tw_company_match_skipped",
    evidence: "company_match_confirmed=true but no company-match step ran",
  },
  18: {
    id: "tw_empty_after_error",
    evidence: "people_search timed out at step 2; brief claims the company has no sales leadership",
  },
};

export function mockRuns(now = Date.now()): ScoredRun[] {
  return COMPANIES.map(([domain, name, headcount], i) => {
    const started = new Date(now - i * 31_000 - 4_000);
    const ended = new Date(started.getTime() + 3_200 + (i % 5) * 400);
    const failure = FAILURES[i];
    const runId = `run_${(0x5f3a1 + i * 7919).toString(16)}`;
    const people: DecisionMaker[] = PEOPLE.slice(0, 3).map(([n, t]) => ({
      name: n,
      title: t,
      linkedin_url: `https://linkedin.com/in/${n.toLowerCase().replace(/ /g, "-")}`,
      source_step_index: 2,
    }));
    if (failure?.invented) {
      people[2] = { name: failure.invented[0], title: failure.invented[1], linkedin_url: null, source_step_index: null };
    }
    const emptyAfterError = failure?.id === "tw_empty_after_error";

    const checks: CheckResult[] = CHECK_IDS.map((id) => {
      const failed = failure?.id === id;
      if (id === "jev_grounded") {
        const score = failure?.invented ? 0.41 : 0.88 + (i % 4) * 0.03;
        return { id, passed: score >= 0.6, evidence: failed ? failure.evidence : "", score: Number(score.toFixed(2)) };
      }
      return { id, passed: !failed, evidence: failed ? failure.evidence : "", score: null };
    });

    return {
      run: {
        run_id: runId,
        trace_id: `nl_tr_${runId.slice(4)}`,
        input: { domain },
        prompt_version: i < 12 ? "v2" : "v1",
        bug_flags: { swallow_tool_errors: emptyAfterError },
        steps: [
          { index: 0, kind: "llm", name: "plan", args: {}, result: null, error: null, latency_ms: 610, cost_usd: 0.0011, synthetic: false },
          { index: 1, kind: "tool", name: "crustdata.company_enrich", args: { domain }, result: { name, headcount }, error: null, latency_ms: 720, cost_usd: 0, synthetic: false },
          {
            index: 2,
            kind: "tool",
            name: "crustdata.people_search",
            args: { domain, titles: ["sales", "revenue"] },
            result: emptyAfterError ? [] : PEOPLE.slice(0, 3).map(([n, t]) => ({ name: n, title: t })),
            error: emptyAfterError ? { code: i === 6 ? "HTTP_429" : "TIMEOUT", message: i === 6 ? "rate limited" : "timed out" } : null,
            latency_ms: 840,
            cost_usd: 0,
            synthetic: false,
          },
          { index: 3, kind: "llm", name: "write_brief", args: {}, result: null, error: null, latency_ms: 1300, cost_usd: 0.0029, synthetic: false },
        ],
        output: {
          domain,
          company_name: name,
          company_match_confirmed: true,
          headcount,
          hiring_signals: [`${Math.max(3, Math.round(headcount / 400))} open sales roles`, "Expanding EMEA go-to-market team"],
          decision_makers: emptyAfterError ? [] : people,
          summary: emptyAfterError
            ? `${name} is a ${headcount.toLocaleString()}-person company. No sales decision makers were found, which suggests leadership is founder-led.`
            : `${name} is a ${headcount.toLocaleString()}-person company actively hiring in sales. Best entry point is ${people[0].name} (${people[0].title}).`,
          no_decision_makers_reason: emptyAfterError ? "No matching people found." : null,
        },
        total_cost_usd: 0.004,
        simulated: false,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
      },
      score: { run_id: runId, checks, violations: checks.filter((c) => !c.passed).map((c) => c.id) },
    };
  });
}
