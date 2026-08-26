// PLAN_VERIFICATION reconciliation for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, applied after
// VALIDATION (sub_agent_execution_results id 43270d2f-8087-43a2-bab3-9f8217dfc7c9,
// CONDITIONAL_PASS 88) found strategic_directives_v2.success_criteria/scope still described the
// pre-lead-self-correction design (gauge-registry.js registration, a chairman_decisions-row
// citation mechanism, marketing_attribution/attributionRows as substrate) rather than what was
// actually built (a plain lib/telemetry/cpa-gauge.mjs module, wired as rungs.cpa into
// venture_demand_verdicts via venture-activation-gate.js, reading daily_rollups only). Also fixes
// the PRD's stray 'stale' state references -- cpa-gauge.mjs deliberately only ever returns
// no_writer_yet/live (see its module docstring: no ratified cadence contract exists for
// daily_rollups, so a 'stale' classification would itself be a fabrication).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = `PRD-${SD_KEY}`;

const success_criteria = [
  {
    measure: 'gauge query returns a real per-channel/venture CPA number for at least one venture+platform with live spend+conversion data in daily_rollups',
    criterion: 'A new lib/telemetry/cpa-gauge.mjs module (computeCpaGaugeState) computes an honest, non-fabricated CPA value from daily_rollups spend_cents/conversions',
  },
  {
    measure: 'gauge query for a venture+platform with zero daily_rollups rows returns an explicit no_writer_yet state, never a fabricated 0',
    criterion: 'The gauge never fabricates a number when spend or conversion data is absent',
  },
  {
    measure: 'venture_demand_verdicts rows written after this change carry a rungs.cpa entry (own vocabulary: state/value_cents_per_conversion/reason), and decideActivationVerdict()\'s PASS/BLOCKED/NO_DATA output and buildPathToPass() text are byte-identical to before this change for all existing fixtures',
    criterion: 'The gauge is wired as a non-gating, additive citation into the existing venture_demand_verdicts decision-audit surface (lib/marketing/venture-activation-gate.js), NOT a new decision table and NOT a new ACTIVATION_RUNGS/RATIFIED_FLOORS gating dimension',
  },
  {
    measure: 'PR diff for this SD touches only lib/telemetry/cpa-gauge.mjs, lib/marketing/venture-activation-gate.js (additive), scripts/cpa-gauge-cli.mjs, and their tests -- confirmed via git diff, zero new migrations, zero new A/B-testing/outreach files',
    criterion: 'No real-human contact, new outbound capability, new A/B-testing infrastructure, or new database migration is introduced by this SD',
  },
];

const scope = `IN SCOPE (as delivered):
- lib/telemetry/cpa-gauge.mjs: a new pure module exporting computeCpaGaugeState({ dailyRollupRows }), following funnel-gauge.mjs's honest-measurement idiom but with a deliberately NARROWER two-state vocabulary (no_writer_yet/live only -- 'stale' is deliberately never returned, since no ratified cadence contract exists for daily_rollups; inventing a staleness heuristic without one would itself be a fabrication).
- The module consumes ONLY daily_rollups (database/migrations/20260214_marketing_engine_foundation.sql) -- spend_cents + conversions, summed across ALL platforms for a venture (TR-2). marketing_attribution and channel_budgets were considered during PLAN but are NOT read by the delivered code: marketing_attribution has no spend column (cannot compute CPA alone) and channel_budgets holds caps, not actual spend-to-outcome ratios.
- Wiring: lib/marketing/venture-activation-gate.js's computeActivationVerdict() calls the new resolveCpaRung() and attaches its result as an additive rungs.cpa key AFTER decideActivationVerdict()/buildPathToPass() have already run on the original 4-rung array -- never passed into either function, so existing verdict/citation/path_to_pass behavior is provably unchanged (see the source comments at the call site and the TR-3 regression test).
- scripts/cpa-gauge-cli.mjs: a standalone CLI for per-channel (platform-scoped) ad-hoc inspection, independent of the verdict flow.

OUT OF SCOPE (already built elsewhere, cited and reused, not rebuilt):
- A/B testing, variant assignment, or experiment infrastructure (lib/eva/experiments/*, lib/marketing/ai/thompson-sampler.js, marketing_content_variants table).
- Any new decision-audit table -- venture_demand_verdicts already provides this, append-only with freeze triggers.
- Any outreach/contact-safety gate -- lib/governance/stage-gate-predicate.js (S24) + lib/eva/launch-mode.js already fully enforce this; this SD introduces zero new send/contact capability.
- lib/governance/gauge-registry.js -- confirmed during LEAD to be a LEO-harness fleet-governance invariant registry (routed to adam/solomon/coordinator/chairman), structurally the wrong home for a venture business metric.
- Adding 'cpa' to ACTIVATION_RUNGS or RATIFIED_FLOORS as a gating dimension -- that requires a chairman-ratified floor, outside this SD's authority; cpa stays informational-only.
- A dedicated "VP of marketing and sales" role/persona (raised as a question in the original roadmap item, not a build requirement).`;

async function main() {
  const { error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .update({ success_criteria, scope })
    .eq('sd_key', SD_KEY);
  if (sdErr) {
    console.error('SD_UPDATE_FAILED', sdErr);
    process.exit(1);
  }
  console.log('SD_RECONCILED');

  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, system_architecture, test_scenarios')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr || !prd) {
    console.error('PRD_FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const functional_requirements = prd.functional_requirements.map((fr) =>
    fr.id === 'FR-1'
      ? {
          ...fr,
          description: fr.description.replace(
            "Follows funnel-gauge.mjs's computeGaugeState() idiom exactly.",
            "Follows funnel-gauge.mjs's computeGaugeState() idiom but with a deliberately NARROWER two-state vocabulary (no_writer_yet/live only) -- 'stale' is never returned, since no ratified cadence contract exists for daily_rollups (unlike venture_telemetry's DEFAULT_CADENCE_HOURS); inventing one would itself be a fabrication. This is a documented, deliberate deviation, not an omission."
          ),
        }
      : fr
  );

  const technical_requirements = prd.technical_requirements.map((tr) =>
    tr.id === 'TR-1'
      ? { ...tr, requirement: tr.requirement + " (two-state: no_writer_yet/live only -- see FR-1's note on why 'stale' is deliberately never returned)" }
      : tr
  );

  const system_architecture = {
    ...prd.system_architecture,
    overview: prd.system_architecture.overview.replace(
      'the same MEASURED/no_writer_yet/live/stale idiom',
      "the same honest-measurement idiom, but a narrower no_writer_yet/live vocabulary (no 'stale', per FR-1's documented rationale)"
    ),
  };

  const test_scenarios = prd.test_scenarios.map((ts) =>
    (ts.id === 'TS-1' || ts.id === 'TS-2' || ts.id === 'TS-3')
      ? { ...ts, test_type: ts.test_type === 'unit' ? 'unit' : ts.test_type }
      : ts
  );

  const { error: prdErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, system_architecture, test_scenarios })
    .eq('id', PRD_ID);
  if (prdErr) {
    console.error('PRD_UPDATE_FAILED', prdErr);
    process.exit(1);
  }
  console.log('PRD_RECONCILED');
}

if (isMainModule(import.meta.url)) {
  main();
}
