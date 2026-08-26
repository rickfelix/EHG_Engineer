// PLAN-phase PRD + user_stories insertion for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, per
// CLAUDE_PLAN.md "PRD Creation — Inline Mode is the Default for Claude Code": the PRD JSON is
// authored directly (not via external LLM call) and inserted into product_requirements_v2 +
// user_stories.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const SD_UUID = 'd654f5ff-f6f3-43ee-9d4d-5e8c6bd9284e';
const PRD_ID = `PRD-${SD_KEY}`;

const executive_summary = "Adds lib/telemetry/cpa-gauge.mjs, an honest per-channel/venture CPA gauge (MEASURED/no_writer_yet) reading daily_rollups, cited non-gating in venture_demand_verdicts.rungs.cpa — the one gap left after 3 of 4 requested capabilities were found already shipped.";

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Implement computeCpaGaugeState() in a new lib/telemetry/cpa-gauge.mjs module',
    description: "A pure function (no I/O) taking pre-fetched daily_rollups rows for one venture_id+platform over a lookback window and returning { state: 'no_writer_yet'|'live'|'stale', value_cents_per_conversion: number|null, reason: string }. Follows funnel-gauge.mjs's computeGaugeState() idiom exactly. Never fabricates a numeric value when spend or conversion data is absent.",
    priority: 'HIGH',
    acceptance_criteria: [
      "Returns state='no_writer_yet' and value_cents_per_conversion=null when zero daily_rollups rows are supplied for the venture+platform",
      "Returns state='live' and a real numeric value_cents_per_conversion = SUM(spend_cents)/SUM(conversions) when SUM(conversions) > 0 within the lookback window",
      "Returns an explicit non-numeric state (value_cents_per_conversion=null, reason names the condition) when SUM(spend_cents) > 0 but SUM(conversions) = 0 — spend with zero conversions is a distinct real signal, never reported as 0",
    ],
  },
  {
    id: 'FR-2',
    requirement: "Wire computeCpaGaugeState() into lib/marketing/venture-activation-gate.js's computeActivationVerdict() as a non-gating, additive rungs.cpa JSONB entry",
    description: "computeActivationVerdict() queries daily_rollups for the venture, calls computeCpaGaugeState(), and adds the result under rungs.cpa in the object it already returns/persists. The existing ACTIVATION_RUNGS array (visitors/signups/activated/paid), decideActivationVerdict(), and buildPathToPass() are left untouched — CPA does not participate in PASS/BLOCKED/NO_DATA computation.",
    priority: 'HIGH',
    acceptance_criteria: [
      'Every venture_demand_verdicts row written after this change has a rungs.cpa key present',
      "decideActivationVerdict()'s verdict/citation output is byte-identical before and after this change for all existing test fixtures (proves non-gating)",
      'ACTIVATION_RUNGS and RATIFIED_FLOORS are not modified by this SD',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Add a query script exposing the CPA gauge outside the verdict flow',
    description: 'scripts/query-cpa-gauge.mjs accepts a venture_id and platform, queries daily_rollups directly, calls computeCpaGaugeState(), and prints the result — for chairman/Adam ad-hoc cost-effectiveness inspection without needing to trigger a full activation verdict.',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'Running the script for a venture/platform with live spend+conversion data prints a real, non-zero CPA number',
      'Running the script for a venture/platform with zero daily_rollups rows prints the explicit no_writer_yet state, not an error or a fabricated number',
    ],
  },
  {
    id: 'FR-4',
    requirement: 'Verify the daily_rollups substrate live before implementation, per validation-agent\'s flagged discrepancy',
    description: 'lib/marketing/dashboard.js reads marketing_campaigns/marketing_channel_metrics, but marketing_channel_metrics has no confirmed migration in this repo. Before writing FR-1/FR-2, confirm live: (a) daily_rollups has at least one populated row anywhere in the fleet, (b) whether marketing_channel_metrics exists as a live table or view. Document both findings in the PR description.',
    priority: 'HIGH',
    acceptance_criteria: [
      'PR description states, with a query and its output, whether daily_rollups has live data',
      'PR description states, with a query and its output, whether marketing_channel_metrics exists live and if so how it relates to daily_rollups',
      'The gauge implementation (FR-1) reads from daily_rollups regardless of the marketing_channel_metrics finding, since daily_rollups is the migration-confirmed substrate',
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Introduce zero new A/B-testing, decision-table, or outreach-capability code',
    description: 'This SD is scoped to exactly the CPA gauge and its wiring. No new experiment/variant assignment code, no new decision-audit table, no new send/contact-capable code path, and no new database migration are introduced.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'git diff for this SD touches only lib/telemetry/cpa-gauge.mjs (new), lib/marketing/venture-activation-gate.js (additive), scripts/query-cpa-gauge.mjs (new), and their tests',
      'No new database/migrations/*.sql file is added by this SD',
      'grep for new outbound/send/contact-capable function definitions in the diff returns zero matches',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'computeCpaGaugeState() must be a pure function with no I/O — the caller (venture-activation-gate.js or the FR-3 script) is responsible for querying daily_rollups and passing rows in',
    rationale: "Matches funnel-gauge.mjs's existing computeGaugeState() pattern exactly, keeping the gauge unit-testable without a live database connection and consistent with the one idiom already adopted fleet-wide for honest measurement.",
  },
  {
    id: 'TR-2',
    requirement: 'CPA = SUM(daily_rollups.spend_cents) / SUM(daily_rollups.conversions), grouped by venture_id + platform, over a caller-supplied lookback window (default 30 days)',
    rationale: 'daily_rollups is the only migration-confirmed table (20260214_marketing_engine_foundation.sql) carrying spend_cents AND conversions together at venture+platform+day grain. marketing_attribution has event-level UTM data but no spend column, so it cannot compute CPA alone; channel_budgets carries budget caps, not actual spend-to-outcome ratios.',
  },
  {
    id: 'TR-3',
    requirement: 'rungs.cpa must NOT be added to venture-activation-gate.js\'s exported ACTIVATION_RUNGS constant or RATIFIED_FLOORS map, and decideActivationVerdict()/buildPathToPass() source must be byte-unchanged by this SD',
    rationale: "Making CPA a gating rung requires a chairman-ratified floor (the same authority that ratified the existing visitors/signups/activated/paid floors per RATIFIED_FLOORS's ratified_by field) — a business threshold decision outside LEAD/PLAN's authority. Until that ratification exists, CPA stays informational-only, per this SD's scope.",
  },
  {
    id: 'TR-4',
    requirement: 'If the daily_rollups query throws inside the FR-2 wiring, the failure must be caught and surfaced as rungs.cpa = { state: "no_writer_yet", reason: "<error message>" } rather than propagating and failing computeActivationVerdict() entirely',
    rationale: 'Matches the existing fail-closed-but-non-crashing pattern already used in the same file for the venture_telemetry read (telErr handling, lines ~271-288) — a new failure mode for one additive rung must not regress the reliability of the pre-existing visitors/signups/activated/paid verdict computation.',
  },
];

const system_architecture = {
  overview: "A new, isolated pure-function module (lib/telemetry/cpa-gauge.mjs) computes a per-venture per-channel cost-per-acquisition value from existing daily_rollups rows, following the same MEASURED/no_writer_yet/live/stale idiom already established by lib/telemetry/funnel-gauge.mjs. Its single caller, lib/marketing/venture-activation-gate.js's computeActivationVerdict(), adds the gauge's output as one new, non-gating key (rungs.cpa) inside the JSONB object it already writes to venture_demand_verdicts — the existing PASS/BLOCKED/NO_DATA computation over visitors/signups/activated/paid is completely untouched. A standalone CLI script provides direct ad-hoc access to the same computation for chairman/Adam inspection, independent of the verdict flow.",
  components: [
    { name: 'lib/telemetry/cpa-gauge.mjs', responsibility: 'Pure computation: given daily_rollups rows for one venture+platform+window, return the honest CPA gauge state', technology: 'Node.js ESM module, no external dependencies' },
    { name: 'lib/marketing/venture-activation-gate.js (modified)', responsibility: 'Queries daily_rollups, calls the new gauge, adds rungs.cpa to its existing verdict-computation output — zero change to gating logic', technology: 'Node.js ESM module, Supabase client' },
    { name: 'scripts/query-cpa-gauge.mjs (new)', responsibility: 'CLI entry point for direct, verdict-flow-independent CPA inspection by chairman/Adam', technology: 'Node.js CLI script' },
  ],
  data_flow: 'daily_rollups (existing table, written by the existing marketing publisher pipeline) -> a scoped SELECT (venture_id+platform+date range) in the caller -> computeCpaGaugeState() (pure) -> either persisted as rungs.cpa inside a venture_demand_verdicts INSERT (via computeActivationVerdict), or printed directly to stdout (via the FR-3 CLI script). No new writes to daily_rollups; the gauge is read-only.',
  integration_points: [
    'lib/marketing/venture-activation-gate.js:34 (existing import line, extended with the new gauge import)',
    'venture_demand_verdicts.rungs JSONB column (additive key, no migration — the table\'s existing venture_demand_verdicts_rungs_is_object CHECK already permits arbitrary object keys)',
  ],
};

const test_scenarios = [
  { id: 'TS-1', scenario: 'Happy path — live spend and conversions', test_type: 'unit', given: 'daily_rollups rows for venture X/platform Y summing to spend_cents=10000, conversions=20 within the lookback window', when: 'computeCpaGaugeState() is called with those rows', then: "it returns { state: 'live', value_cents_per_conversion: 500 }" },
  { id: 'TS-2', scenario: 'No data at all', test_type: 'unit', given: 'zero daily_rollups rows for venture X/platform Z', when: 'computeCpaGaugeState() is called with an empty row set', then: "it returns { state: 'no_writer_yet', value_cents_per_conversion: null }, never a fabricated 0" },
  { id: 'TS-3', scenario: 'Spend with zero conversions (edge case)', test_type: 'unit', given: 'daily_rollups rows summing to spend_cents=5000, conversions=0', when: 'computeCpaGaugeState() is called with those rows', then: 'it returns a distinct non-numeric state (value_cents_per_conversion=null) with a reason naming the zero-conversions condition, never 0 and never Infinity' },
  { id: 'TS-4', scenario: 'Non-gating regression proof', test_type: 'integration', given: 'a real venture_id and its existing test fixture used by decideActivationVerdict()\'s current test suite', when: 'computeActivationVerdict() runs after the FR-2 wiring change', then: "the returned verdict/citation/path_to_pass are byte-identical to a pre-change snapshot for the same fixture, and rungs now additionally contains a cpa key" },
  { id: 'TS-5', scenario: 'Upstream query failure handled without crashing the verdict', test_type: 'error handling', given: 'the daily_rollups query inside the FR-2 wiring throws (simulated DB error)', when: 'computeActivationVerdict() runs', then: "rungs.cpa is set to { state: 'no_writer_yet', reason: '<error message>' } and the overall verdict computation completes normally for the other rungs, matching TR-4" },
  { id: 'TS-6', scenario: 'CLI query surface', test_type: 'integration', given: 'the FR-3 script run against a venture/platform with live daily_rollups data', when: 'scripts/query-cpa-gauge.mjs executes', then: 'it prints a real CPA number to stdout matching what computeCpaGaugeState() returns for the same input' },
];

const acceptance_criteria = [
  'computeCpaGaugeState() returns a real, non-fabricated CPA number for at least one venture/channel with live spend+conversion data in daily_rollups',
  "computeCpaGaugeState() returns an explicit no_writer_yet state (never a fabricated 0) for a venture/channel with zero daily_rollups rows",
  "venture_demand_verdicts rows written after this change carry a rungs.cpa entry, and decideActivationVerdict()'s PASS/BLOCKED/NO_DATA outcome is unchanged for all existing test fixtures",
  'Zero new database migrations, A/B-testing files, decision tables, or outreach-capable code paths are introduced by this SD',
];

const risks = [
  {
    risk: "dashboard.js currently reads marketing_channel_metrics/marketing_campaigns, a possibly stale or differently-scoped read path than daily_rollups — skipping FR-4's live-schema check could wire the gauge to the wrong substrate",
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'FR-4 requires an explicit, documented live-schema check before FR-1/FR-2 implementation; daily_rollups is used as the canonical migration-confirmed substrate regardless of what dashboard.js currently does',
    rollback_plan: 'computeCpaGaugeState() is a new, isolated pure function with zero callers until the FR-2 wiring commit; reverting that one commit removes all runtime effect with zero blast radius to existing functionality',
  },
  {
    risk: 'A future maintainer could misread rungs.cpa as a gating dimension and add it to ACTIVATION_RUNGS without a ratified floor, silently changing PASS/BLOCKED outcomes fleet-wide',
    probability: 'LOW',
    impact: 'HIGH',
    mitigation: "TR-3 requires an explicit code comment at both the rungs.cpa write site and ACTIVATION_RUNGS's definition site, citing this SD and stating CPA is informational-only pending chairman floor ratification",
    rollback_plan: 'Revert the FR-2 wiring commit; rows written before the revert simply carry an extra, unused JSONB key with no functional impact since JSONB additions are additive-safe',
  },
  {
    risk: "Naming/scope confusion with the already-shipped SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001's unrelated referral-loop concept of 'demand loop' could cause a future search/dedup pass to conflate the two",
    probability: 'LOW',
    impact: 'LOW',
    mitigation: "PRD, code comments, and commit messages explicitly disambiguate: this SD's 'demand-loop decision layer' language refers to venture-activation-gate.js's verdict flow, not the referral loop",
    rollback_plan: 'Not applicable — a documentation/naming risk with no code rollback needed; a corrective comment/doc update suffices if confusion arises',
  },
  {
    risk: "computeCpaGaugeState()'s default 30-day lookback window may not match chairman/Adam's actual expectation for 'continually measure' cost-effectiveness responsiveness",
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'The lookback window is a required, explicit parameter (never hardcoded internally); callers may override the documented default',
    rollback_plan: 'Adjusting the default is a one-line change with no schema impact',
  },
];

const implementation_approach = {
  phases: [
    { phase: 'Phase 1', description: "Substrate verification (FR-4): confirm daily_rollups has live data fleet-wide and determine marketing_channel_metrics's live status", deliverables: ['Live-schema check results documented in the PR description'] },
    { phase: 'Phase 2', description: 'Gauge implementation (FR-1): build lib/telemetry/cpa-gauge.mjs with unit tests covering TS-1/TS-2/TS-3', deliverables: ['lib/telemetry/cpa-gauge.mjs', 'tests/unit/telemetry/cpa-gauge.test.mjs'] },
    { phase: 'Phase 3', description: 'Wiring + non-gating proof (FR-2, TR-3, TR-4): wire the gauge into computeActivationVerdict(), add the TS-4 regression test proving decideActivationVerdict() output is unchanged, and the TS-5 error-handling test', deliverables: ['Updated lib/marketing/venture-activation-gate.js', 'Non-gating regression test', 'Error-handling test'] },
    { phase: 'Phase 4', description: 'Query surface + ship (FR-3): add the CLI script, run the SD-level smoke_test_steps, ship via /ship', deliverables: ['scripts/query-cpa-gauge.mjs', 'Smoke test evidence', 'Merged PR'] },
  ],
  technical_decisions: [
    "CPA is surfaced as a non-gating rungs.cpa JSONB key, not a new ACTIVATION_RUNGS entry, because gating requires chairman floor ratification which is outside this SD's authority",
    'daily_rollups (not marketing_channel_metrics or marketing_attribution) is the canonical read path because it is the only migration-confirmed table carrying spend_cents and conversions together at the required grain',
    "computeCpaGaugeState() is a pure function taking pre-fetched rows, mirroring funnel-gauge.mjs's I/O-free computeGaugeState(), for testability without a live database",
  ],
};

const integration_operationalization = {
  consumers: [
    { name: 'lib/marketing/venture-activation-gate.js (computeActivationVerdict)', interaction: 'Imports and calls computeCpaGaugeState(); writes its output into the persisted rungs.cpa JSONB field on every venture_demand_verdicts row it writes', frequency: 'Every time a venture demand verdict is computed (on-demand, per venture)' },
    { name: 'Chairman / Adam (via the FR-3 query script or direct venture_demand_verdicts inspection)', interaction: 'Reads the rungs.cpa value for ad-hoc cost-effectiveness review', frequency: 'As-needed, not on a fixed cadence' },
  ],
  dependencies: [
    { name: 'daily_rollups table (database/migrations/20260214_marketing_engine_foundation.sql)', type: 'upstream', contract: 'Read-only SELECT of spend_cents/conversions/venture_id/platform/rollup_date columns', failure_handling: "A query error or zero rows surfaces as state='no_writer_yet' with an explicit reason string, never a crash or a fabricated number" },
    { name: "lib/marketing/venture-activation-gate.js's computeActivationVerdict()", type: 'downstream', contract: 'The new rungs.cpa key is additive JSONB; existing rungs/verdict/citation/path_to_pass fields and their consumers are byte-unchanged', failure_handling: 'If computeCpaGaugeState() throws, the caller catches it and records rungs.cpa as an error/unmeasurable state (TR-4) rather than letting the whole verdict computation fail' },
  ],
  data_contracts: [
    { contract_name: 'daily_rollups read contract', schema: 'id, rollup_date, venture_id, platform, spend_cents, conversions (+ derived ctr/conversion_rate columns, unused by this gauge)', validation: 'SUM(spend_cents)/SUM(conversions) computed only when SUM(conversions) > 0; venture_id+platform scoping is enforced by the caller\'s query, not inside the pure function', versioning: 'No schema changes required; this SD only reads existing columns' },
    { contract_name: 'venture_demand_verdicts.rungs.cpa shape', schema: "{ state: 'no_writer_yet'|'live'|'stale', value_cents_per_conversion: number|null, reason: string }", validation: 'value_cents_per_conversion is null whenever state is not \'live\'; never 0 as a substitute for null', versioning: "Additive JSONB key; no migration needed — the table's existing venture_demand_verdicts_rungs_is_object CHECK already permits arbitrary object keys" },
  ],
  runtime_config: {
    environment_variables: [],
    feature_flags: [],
    deployment_considerations: 'No new environment variables, feature flags, or deployment steps required; this is a pure-library addition plus one additive call site in an existing module.',
  },
  observability_rollout: {
    monitoring: ["Spot-check venture_demand_verdicts.rungs->>'cpa' via SQL after deploy to confirm the key is present on new rows"],
    alerts: [],
    rollout_strategy: 'Direct deploy (infrastructure SD, no feature flag needed) — the change is additive and non-gating by construction (TR-3), so there is no PASS/BLOCKED behavior change to roll out gradually',
    rollback_trigger: "Any regression-test failure showing decideActivationVerdict()'s output changed for existing fixtures",
    rollback_procedure: 'Revert the FR-2 wiring commit (isolated, single-purpose); lib/telemetry/cpa-gauge.mjs itself can remain in the tree unused since it has no callers once the wiring commit is reverted',
  },
};

const exploration_summary = {
  files_read: [
    'lib/eva/experiments/experiment-assignment.js',
    'lib/marketing/ai/thompson-sampler.js',
    'database/migrations/20260214_marketing_engine_foundation.sql',
    'lib/governance/gauge-registry.js',
    'lib/telemetry/funnel-gauge.mjs',
    'lib/marketing/budget-governor.js',
    'lib/marketing/dashboard.js',
    'database/migrations/20260809_venture_demand_verdicts.sql',
    'lib/marketing/venture-activation-gate.js',
    'lib/marketing/autonomy-gate.js',
    'lib/eva/chairman-product-review.js',
    'lib/governance/stage-gate-predicate.js',
    'lib/eva/launch-mode.js',
    'docs/design/venture-demand-distribution-engine.md',
  ],
  patterns_identified: [
    "funnel-gauge.mjs's computeGaugeState() no_writer_yet/live/stale idiom for honest, never-fabricated measurement",
    'venture-activation-gate.js\'s additive-JSONB-key pattern in the rungs object (new keys can be added without a migration or gating impact)',
    'gauge-registry.js\'s role-routed invariant pattern — confirmed structurally NOT applicable to this SD (it is a LEO-harness/fleet-governance registry, not a venture-metrics one)',
  ],
  key_decisions: [
    'Narrowed scope from 4 originally-proposed net-new subsystems to 1 gauge + wiring, after Explore + validation-agent (CONDITIONAL_PASS 92, evidence row 26599db9-2234-426a-9607-1d2bb00f0adf) found 3 of 4 already shipped',
    'Corrected an initial mis-identification of lib/governance/gauge-registry.js as the integration point (it is LEO-harness scoped); corrected to a plain-module + additive-JSONB-key pattern matching funnel-gauge.mjs',
    "CPA is informational-only (rungs.cpa), not a new gating ACTIVATION_RUNGS entry, because gating requires chairman floor ratification outside this SD's authority",
  ],
  exploration_date: new Date().toISOString().slice(0, 10),
};

async function main() {
  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .maybeSingle();

  const prdRow = {
    id: PRD_ID,
    directive_id: SD_KEY,
    sd_id: SD_UUID,
    title: 'Venture CPA Gauge PRD',
    version: '1.0',
    status: 'approved',
    category: 'Infrastructure',
    priority: 'high',
    executive_summary,
    goal_summary: executive_summary,
    functional_requirements,
    technical_requirements,
    system_architecture,
    test_scenarios,
    acceptance_criteria,
    risks,
    implementation_approach,
    integration_operationalization,
    exploration_summary,
    phase: 'PLAN',
    created_by: 'PLAN',
  };

  let result;
  if (existingPrd) {
    result = await supabase.from('product_requirements_v2').update(prdRow).eq('id', PRD_ID).select('id, status').single();
  } else {
    result = await supabase.from('product_requirements_v2').insert(prdRow).select('id, status').single();
  }
  if (result.error) {
    console.error('PRD_WRITE_FAILED', result.error);
    process.exit(1);
  }
  console.log('PRD_WRITTEN', JSON.stringify(result.data));

  const stories = functional_requirements.map((fr, idx) => ({
    story_key: `${SD_KEY}:US-${String(idx + 1).padStart(3, '0')}`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: fr.requirement,
    user_role: 'PLAN/EXEC engineer',
    user_want: fr.requirement,
    user_benefit: fr.description,
    story_points: idx === 0 || idx === 1 ? 5 : 3,
    priority: fr.priority.toLowerCase(),
    status: 'ready',
    acceptance_criteria: fr.acceptance_criteria.map((ac, acIdx) => ({
      id: `AC-${String(acIdx + 1).padStart(3, '0')}`,
      type: 'functional',
      criteria: ac,
    })),
    implementation_context: JSON.stringify({
      prerequisites: idx === 1 ? ['FR-1 (cpa-gauge.mjs) must exist'] : idx === 2 ? ['FR-1 (cpa-gauge.mjs) must exist'] : [],
      technical_notes: `Implements ${fr.id}: ${fr.requirement}`,
      tables_affected: fr.id === 'FR-2' ? ['venture_demand_verdicts'] : fr.id === 'FR-1' || fr.id === 'FR-3' ? ['daily_rollups'] : [],
      estimated_complexity: fr.priority === 'CRITICAL' ? 'low' : 'medium',
    }),
    created_by: 'PLAN',
  }));

  for (const story of stories) {
    const { data: existingStory } = await supabase
      .from('user_stories')
      .select('id')
      .eq('story_key', story.story_key)
      .maybeSingle();
    let storyResult;
    if (existingStory) {
      storyResult = await supabase.from('user_stories').update(story).eq('story_key', story.story_key).select('story_key').single();
    } else {
      storyResult = await supabase.from('user_stories').insert(story).select('story_key').single();
    }
    if (storyResult.error) {
      console.error('STORY_WRITE_FAILED', story.story_key, storyResult.error);
      process.exit(1);
    }
    console.log('STORY_WRITTEN', storyResult.data.story_key);
  }

  console.log('DONE');
}

if (isMainModule(import.meta.url)) {
  main();
}
