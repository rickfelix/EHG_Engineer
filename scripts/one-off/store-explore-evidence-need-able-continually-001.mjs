#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work performed before LEAD's rescope was written: a very
 * thorough (56 tool-call) sweep of EHG_Engineer + EHG for existing A/B testing,
 * cost-effectiveness gauge, demand-loop decision-audit, and outreach-safety
 * infrastructure, independently re-verified by validation-agent afterward.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';

const findings = [
  {
    id: 'ab-testing-fully-built',
    severity: 'INFO',
    summary: 'lib/eva/experiments/experiment-assignment.js:19-146 assignVariant() does deterministic SHA-256 hash-bucketing or Thompson Sampling (Beta-posterior bandit) against an experiment_assignments table (confirmed live via Supabase probe), with race-condition handling on 23505 conflicts. A second, marketing-specific Thompson Sampler exists at lib/marketing/ai/thompson-sampler.js:1-157. database/migrations/20260214_marketing_engine_foundation.sql creates marketing_content_variants (line 45-58) and daily_rollups (line 128, per content/variant/platform spend+impressions+clicks+conversions with generated ctr/conversion_rate columns) already wired to a publisher (publisher/index.js:160-171 writes attribution rows on every dispatch).',
  },
  {
    id: 'cpa-cost-effectiveness-gauge-genuine-gap',
    severity: 'HIGH',
    summary: 'Direct grep of lib/governance/gauge-registry.js (GAUGE_REGISTRY array, ~20 entries) for cpa|cost.per|cost_per|acquisition.cost|cost.effectiveness returned zero matches -- no CPA/cost-effectiveness gauge exists. The substrate to compute it already exists: channel_budgets table (20260214 migration line 105) + lib/marketing/budget-governor.js:17-127 (checkBudget/recordSpend/getBudgetSummary) + daily_rollups/marketing_attribution (spend_cents, conversions). lib/marketing/dashboard.js:68-182 already computes roi=(revenue-spend)/spend and conversionRate but not a registered, honestly-gauged CPA metric. The honest-measurement idiom to reuse is lib/telemetry/funnel-gauge.mjs:43 computeGaugeState() (no_writer_yet/live/stale, never fabricates a number) and lib/marketing/venture-activation-gate.js:36-46 (MEASURED/UNMEASURABLE, PASS/BLOCKED/NO_DATA).',
  },
  {
    id: 'demand-loop-decision-audit-fully-built-plus-naming-collision-warning',
    severity: 'HIGH',
    summary: 'venture_demand_verdicts table (database/migrations/20260809_venture_demand_verdicts.sql:43-154, append-only, PASS/BLOCKED/NO_DATA, freeze triggers on UPDATE/DELETE) computed by lib/marketing/venture-activation-gate.js (computeActivationVerdict, decideActivationVerdict:190-227, buildPathToPass:234-261), consumed by lib/marketing/autonomy-gate.js:497-561 evaluateGraduation() (a channel only graduates to autonomy with a PASS verdict). lib/eva/chairman-product-review.js:18-19 has PRODUCT_REVIEW_STAGE=23 -- literally the SDs own "S23" reference. NAMING COLLISION: SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 (UUID 96219580-132e-4594-a61c-62da9b3eed6d) already used "demand loop" for a DIFFERENT concept (a referral-code/attribution loop), not this SDs decision-audit sense -- must be disambiguated in naming/comments.',
  },
  {
    id: 'no-real-outreach-fully-enforced',
    severity: 'INFO',
    summary: 'lib/governance/stage-gate-predicate.js:1-297 checkStageGate()/shouldEnforceBlock() is the one shared implementation; comment at line 10 verbatim: "Building is free at any stage; CONTACTING a real human is gated at S24 (Go Live)." lib/marketing/autonomy-gate.js:20-23 sets STAGE_GATE_REQUIRED_STAGE=24 and calls this gate at the single chokepoint (checkPublishAuthorization). lib/eva/launch-mode.js:11-46 ventures.launch_mode is simulated (default) vs live; setLaunchMode() (109-246) is the only write path, chairman-decision-gated. lib/marketing/autonomy-gate.js:106-242 HONESTY_INVARIANTS (suppression/consent/non_fabrication/aup_volume) run fail-closed before any autonomous send.',
  },
  {
    id: 'master-design-doc-anti-rebuild-ledger',
    severity: 'INFO',
    summary: 'docs/design/venture-demand-distribution-engine.md Section 3 ("anti-rebuild ledger", chairman-ratified 2026-07-09) explicitly states the publisher rail, autonomy model, and funnel gauge are to be wired, not rebuilt -- directly on-point for this SDs originally-proposed (and now narrowed) scope.',
  },
  {
    id: 'related-shipped-sds-in-same-territory',
    severity: 'INFO',
    summary: 'Confirmed recently-shipped SDs covering adjacent territory (all within ~3 weeks per migration/file dates): SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 (referral loop), SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001 (human-outreach demand-test + chairman gate + no-send safety tests), SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 (built venture_demand_verdicts + venture-activation-gate.js), SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-{A,C,D} (funnel gauge, autonomy-gate chokepoint, outreach-motion policy), SD-LEO-INFRA-STAGE-GATE-PREDICATE-001 (S24 gate), SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (S23 gate), SD-EVA-FEAT-MARKETING-FOUNDATION-001/SD-EVA-FEAT-MARKETING-AI-001/SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001 (marketing schema, Thompson Sampler, honesty invariants).',
  },
];

const warnings = [
  'lib/marketing/dashboard.js currently reads marketing_campaigns/marketing_channel_metrics for its roi/conversionRate computation, but marketing_channel_metrics has no confirmed migration in the repo -- the true, migration-backed substrate for the new CPA gauge is daily_rollups/marketing_attribution/channel_budgets (20260214 migration). PLAN must verify live schema population before choosing the gauge read path, not assume dashboard.js\'s existing read path is the correct one to extend.',
  'The originally-proposed scope (A/B testing + cost-effectiveness + demand-loop decision layer + outreach safety, all as apparently-new capability) would have duplicated 3 of 4 pieces of recently-shipped infrastructure if built as originally described -- LEAD narrowed scope to the one genuine gap (CPA gauge) plus wiring, per the 75% scope_reduction_percentage recorded on this SD.',
];

const recommendations = [
  'PLAN should scope the PRD to exactly: (1) a new CPA/cost-effectiveness gauge entry in gauge-registry.js consuming channel_budgets+daily_rollups+marketing_attribution with MEASURED/UNMEASURABLE semantics, and (2) wiring its output as a citation into an existing venture_demand_verdicts or chairman_decisions row -- explicitly excluding any new A/B-testing, decision-table, or outreach-safety code.',
  'PLAN should resolve the dashboard.js vs migration-confirmed-tables substrate discrepancy (see warnings) before EXEC begins, choosing daily_rollups/marketing_attribution/channel_budgets unless a live-schema check proves marketing_channel_metrics is populated and current.',
  'PRD and code comments should explicitly disambiguate this SD\'s "demand-loop decision layer" language from SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001\'s unrelated referral-loop usage of the same term.',
];

const summary = 'Explore-phase discovery for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 (very thorough, 56 tool calls across EHG_Engineer + EHG) found that 3 of the SD\'s originally-proposed 4 deliverables are already fully built and shipped in the last ~3 weeks: A/B testing/variant assignment (experiment-assignment.js, thompson-sampler.js, marketing_content_variants), demand-loop continue/stop decision audit (venture_demand_verdicts, venture-activation-gate.js, chairman-product-review.js S23), and no-real-outreach enforcement (stage-gate-predicate.js S24, launch-mode.js). The one genuine gap is a CPA/cost-effectiveness gauge, for which the substrate (channel_budgets/daily_rollups/marketing_attribution) exists but no registered gauge does. A master design doc (docs/design/venture-demand-distribution-engine.md) explicitly directs wiring existing infra rather than rebuilding it. This exploration was the basis for LEAD narrowing the SD to the CPA gauge + wiring only (scope_reduction_percentage=75), independently re-verified afterward by validation-agent (CONDITIONAL_PASS, confidence 92).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 93,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
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
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
