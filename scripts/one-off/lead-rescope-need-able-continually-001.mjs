// LEAD-phase rescope for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, informed by Explore
// (very thorough) + validation-agent (CONDITIONAL_PASS, confidence 92, evidence row
// 26599db9-2234-426a-9607-1d2bb00f0adf). 3 of the SD's 4 original success_criteria are
// already fully satisfied by shipped infrastructure; only the CPA/cost-effectiveness
// gauge is a genuine gap. Narrowing scope per LEAD Q5 (Existing Tools) + Q8 (Deletion
// Audit) rather than building a duplicate A/B testing / decision-audit / outreach-fence
// system.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';

const description = `Venture-agnostic cost-per-acquisition (CPA) / cost-effectiveness gauge, registered in lib/governance/gauge-registry.js, honestly reporting spend-per-outcome per marketing channel per venture.

Originally promoted from a raw roadmap item requesting A/B testing + cost-effectiveness measurement for marketing campaigns. LEAD-phase Explore + validation-agent (CONDITIONAL_PASS 92%, sub_agent_execution_results row 26599db9-2234-426a-9607-1d2bb00f0adf) independently confirmed 3 of the 4 originally-proposed deliverables are ALREADY BUILT and must be reused, not rebuilt:
- A/B testing / variant assignment: lib/eva/experiments/experiment-assignment.js (SHA-256 hash-bucketing + Thompson Sampling against experiment_assignments), lib/marketing/ai/thompson-sampler.js, marketing_content_variants table (database/migrations/20260214_marketing_engine_foundation.sql).
- Demand-loop continue/stop decision audit: venture_demand_verdicts table (append-only PASS/BLOCKED/NO_DATA, database/migrations/20260809_venture_demand_verdicts.sql) + lib/marketing/venture-activation-gate.js + lib/eva/chairman-product-review.js (PRODUCT_REVIEW_STAGE=23).
- No-real-outreach enforcement: lib/governance/stage-gate-predicate.js (S24 external-contact gate) + lib/eva/launch-mode.js (chairman-gated simulated/live venture mode) + lib/marketing/autonomy-gate.js HONESTY_INVARIANTS.

The one genuine gap: no CPA/cost-effectiveness gauge exists in gauge-registry.js (confirmed via direct grep, zero matches across ~20 registered gauges). The substrate to compute it already exists (channel_budgets, daily_rollups, marketing_attribution tables) but is not exposed as a registered, honestly-measured gauge.

Scope is narrowed accordingly (see scope field). docs/design/venture-demand-distribution-engine.md's "anti-rebuild ledger" (§3) explicitly directs wiring existing infra rather than rebuilding it.`;

const scope = `IN SCOPE:
- New CPA/cost-effectiveness gauge registered in lib/governance/gauge-registry.js, consuming channel_budgets + daily_rollups + marketing_attribution (database/migrations/20260214_marketing_engine_foundation.sql), computing spend-per-outcome per channel per venture.
- Honest measurement semantics matching the funnel-gauge.mjs computeGaugeState() idiom (no_writer_yet/live/stale — NEVER fabricate a 0 or a ratio when spend or conversion data is absent for a channel/venture).
- Wiring the gauge's output as a CITATION into an existing decision-audit surface (venture_demand_verdicts row or chairman_decisions row via lib/eva/chairman-product-review.js) — NOT a new decision table.
- PLAN-phase must resolve a substrate discrepancy flagged by validation-agent: lib/marketing/dashboard.js currently reads marketing_campaigns/marketing_channel_metrics (marketing_channel_metrics has no confirmed migration) while the true, migration-backed substrate is daily_rollups/marketing_attribution/channel_budgets. Verify live schema before choosing the gauge's read path.

OUT OF SCOPE (already built, cite and reuse, do not rebuild):
- A/B testing, variant assignment, or experiment infrastructure (lib/eva/experiments/*, lib/marketing/ai/thompson-sampler.js, marketing_content_variants table) — fully exists.
- Any new decision-audit table — venture_demand_verdicts already provides this, append-only with freeze triggers.
- Any outreach/contact-safety gate — lib/governance/stage-gate-predicate.js (S24) + lib/eva/launch-mode.js already fully enforce this; this SD introduces zero new send/contact capability.
- A dedicated "VP of marketing and sales" role/persona (raised as a question in the original roadmap item, not a build requirement) — out of scope, not a LEO Protocol build item.`;

const strategic_objectives = [
  'Close the one genuine measurement gap (CPA/cost-effectiveness gauge) identified after due-diligence against shipped infrastructure',
  'Extend the existing gauge-registry.js honest-measurement pattern rather than introducing a parallel spend-tracking or decision-audit system',
  'Preserve the existing no-real-outreach safety invariants (S24 stage gate, simulated/live launch mode) with zero new contact-capable code paths',
];

const key_changes = [
  {
    change: 'Add a CPA / cost-effectiveness gauge to lib/governance/gauge-registry.js, consuming channel_budgets + daily_rollups + marketing_attribution, following the MEASURED/UNMEASURABLE (no_writer_yet/live/stale) idiom from lib/telemetry/funnel-gauge.mjs:43 computeGaugeState()',
    impact: 'Gives EHG_Engineer its first honestly-measured per-channel per-venture cost-effectiveness signal, closing the gap Explore + validation-agent confirmed is the only genuinely missing piece of the originally-requested capability',
  },
  {
    change: "Wire the new gauge's output as a citation into an existing decision-audit surface (venture_demand_verdicts row or a chairman_decisions row via lib/eva/chairman-product-review.js) instead of creating a new decision table",
    impact: 'Satisfies the "results feed the decision layer" requirement from the original roadmap item without duplicating the already-shipped venture_demand_verdicts append-only audit trail',
  },
];

const success_criteria = [
  {
    criterion: 'CPA/cost-effectiveness gauge is registered in gauge-registry.js and returns a real per-channel per-venture CPA number when spend + conversion data exist',
    measure: 'gauge query returns a non-fabricated numeric CPA for at least one venture/channel with live spend+conversion rows in daily_rollups/marketing_attribution',
  },
  {
    criterion: 'Gauge honestly reports UNMEASURABLE (never a fabricated 0 or ratio) when a channel/venture has no spend or conversion data',
    measure: 'gauge query for a channel/venture with zero rows in daily_rollups/marketing_attribution returns an explicit no_writer_yet/UNMEASURABLE state, not 0',
  },
  {
    criterion: 'Gauge output is citable from an existing decision-audit surface, satisfying "results feed the decision layer" without a new decision table',
    measure: 'one recorded venture_demand_verdicts or chairman_decisions row citing the new CPA gauge id/value in its rationale or evidence',
  },
  {
    criterion: 'No duplicate A/B-testing, decision-audit, or outreach-safety infrastructure is introduced; this SD only adds the gauge + its wiring',
    measure: "PR diff for this SD touches only lib/governance/gauge-registry.js, the new gauge module, and its decision-surface wiring — zero new experiment/variant/outreach files, per the OUT OF SCOPE list",
  },
  {
    criterion: 'No real-human contact or new outbound capability is introduced (inherited constraint from the original roadmap item)',
    measure: 'PRD explicitly confirms zero new send/contact code paths; existing stage-gate-predicate.js (S24) + launch-mode.js remain the sole enforcement points, untouched by this SD',
  },
];

const risks = [
  {
    risk: 'dashboard.js currently reads marketing_campaigns/marketing_channel_metrics, but marketing_channel_metrics has no confirmed migration — the gauge could be wired to a stale/unpopulated read path if PLAN does not verify live schema first',
    impact: 'medium',
    likelihood: 'medium',
    mitigation: 'PLAN phase must run a live-schema check (confirm marketing_channel_metrics population, or default to the migration-confirmed daily_rollups/marketing_attribution/channel_budgets substrate) before EXEC begins',
  },
  {
    risk: 'Naming/scope confusion with SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001, which already uses "demand loop" for an unrelated referral/attribution concept',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'PRD and code comments explicitly disambiguate: this SD is a measurement gauge feeding an existing decision-audit surface, not a referral loop',
  },
  {
    risk: 'Implementation may not fully address root cause',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs',
  },
];

const mechanism_verifications = [
  { verified_by: 'validation-agent', verified_at: 'lib/governance/gauge-registry.js:58' },
  { verified_by: 'validation-agent', verified_at: 'lib/telemetry/funnel-gauge.mjs:43' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260214_marketing_engine_foundation.sql:105' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260214_marketing_engine_foundation.sql:128' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260214_marketing_engine_foundation.sql:165' },
  { verified_by: 'validation-agent', verified_at: 'lib/eva/experiments/experiment-assignment.js:19' },
  { verified_by: 'validation-agent', verified_at: 'lib/marketing/venture-activation-gate.js:36' },
  { verified_by: 'validation-agent', verified_at: 'lib/governance/stage-gate-predicate.js:1' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260809_venture_demand_verdicts.sql:43' },
];

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr || !sd) {
    console.error('FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const newMetadata = {
    ...sd.metadata,
    mechanism_verifications,
    needs_enrichment: [],
    lead_rescope: {
      at: new Date().toISOString(),
      by: 'c29c1952-8d10-4a11-a71e-5ca637c41106',
      reason: 'Explore + validation-agent (CONDITIONAL_PASS 92) found 3 of 4 original deliverables already shipped; narrowed to the one genuine gap (CPA gauge)',
      validation_evidence_row: '26599db9-2234-426a-9607-1d2bb00f0adf',
    },
  };

  const { data: updated, error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      title: 'Venture cost-per-acquisition gauge: honest CPA measurement per channel',
      description,
      scope,
      strategic_objectives,
      key_changes,
      success_criteria,
      risks,
      scope_reduction_percentage: 75,
      metadata: newMetadata,
    })
    .eq('id', sd.id)
    .select('id, sd_key, title, scope_reduction_percentage')
    .single();

  if (updateErr) {
    console.error('UPDATE_FAILED', updateErr);
    process.exit(1);
  }

  console.log('RESCOPE_OK', JSON.stringify(updated, null, 2));
}

main();
