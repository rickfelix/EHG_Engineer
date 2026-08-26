// LEAD-phase self-correction for SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, applied AFTER the initial
// rescope one-off but BEFORE PRD authoring. Direct inspection of lib/governance/gauge-registry.js
// (a LEO-harness/fleet-governance invariant registry: unranked-claimable-leaves, stale-tree,
// relay-drop, ownerRole: adam|solomon|coordinator|chairman) showed it is the WRONG integration
// point for a venture business metric -- both Explore and validation-agent's recommendation to
// "register" the new gauge there was incorrect. lib/telemetry/funnel-gauge.mjs is not a registry
// entry either; it is a plain exported pure function, imported directly by
// lib/marketing/venture-activation-gate.js:34. This correction fixes the SD's
// description/scope/key_changes to specify the correct pattern before it reaches the PRD.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';

const description = `Venture-agnostic cost-per-acquisition (CPA) / cost-effectiveness gauge, implemented as a new pure computation module (lib/telemetry/cpa-gauge.mjs) following the computeGaugeState() idiom from lib/telemetry/funnel-gauge.mjs, honestly reporting spend-per-outcome per marketing channel per venture.

CORRECTION (post-LEAD self-review, before PRD authoring): the original LEAD rescope described this as "registered in lib/governance/gauge-registry.js". Direct inspection shows gauge-registry.js is a LEO-harness/fleet-governance invariant registry (ownerRole: adam|solomon|coordinator|chairman, entries like unranked-claimable-leaves/stale-tree/relay-drop) -- scoped to LEO protocol drift detection, NOT venture business metrics. It is the wrong integration point. funnel-gauge.mjs is NOT a registry entry either -- it is a plain exported pure function (computeGaugeState/computePaidGaugeState), imported directly by lib/marketing/venture-activation-gate.js:34 and called at line 115/171. The new CPA gauge follows this SAME plain-module-import pattern, not gauge-registry.js's detector-registration pattern.

Originally promoted from a raw roadmap item requesting A/B testing + cost-effectiveness measurement for marketing campaigns. LEAD-phase Explore + validation-agent (CONDITIONAL_PASS 92%, sub_agent_execution_results row 26599db9-2234-426a-9607-1d2bb00f0adf) independently confirmed 3 of the 4 originally-proposed deliverables are ALREADY BUILT and must be reused, not rebuilt:
- A/B testing / variant assignment: lib/eva/experiments/experiment-assignment.js (SHA-256 hash-bucketing + Thompson Sampling against experiment_assignments), lib/marketing/ai/thompson-sampler.js, marketing_content_variants table (database/migrations/20260214_marketing_engine_foundation.sql).
- Demand-loop continue/stop decision audit: venture_demand_verdicts table (append-only PASS/BLOCKED/NO_DATA, database/migrations/20260809_venture_demand_verdicts.sql) + lib/marketing/venture-activation-gate.js + lib/eva/chairman-product-review.js (PRODUCT_REVIEW_STAGE=23).
- No-real-outreach enforcement: lib/governance/stage-gate-predicate.js (S24 external-contact gate) + lib/eva/launch-mode.js (chairman-gated simulated/live venture mode) + lib/marketing/autonomy-gate.js HONESTY_INVARIANTS.

The one genuine gap: no CPA/cost-effectiveness measurement exists anywhere (confirmed via direct grep of gauge-registry.js AND direct read of funnel-gauge.mjs/venture-activation-gate.js -- neither computes CPA). The substrate to compute it already exists (channel_budgets, daily_rollups, marketing_attribution tables) but is not exposed as an honestly-measured value.

Scope is narrowed accordingly (see scope field). docs/design/venture-demand-distribution-engine.md's "anti-rebuild ledger" (Section 3) explicitly directs wiring existing infra rather than rebuilding it.`;

const scope = `IN SCOPE:
- New lib/telemetry/cpa-gauge.mjs module exporting computeCpaGaugeState({ dailyRollupRows, attributionRows, now }), a pure function following funnel-gauge.mjs's computeGaugeState() idiom (no_writer_yet/live/stale -- NEVER fabricate a 0 or ratio when spend or conversion data is absent for a channel/venture).
- The module consumes channel_budgets + daily_rollups + marketing_attribution (database/migrations/20260214_marketing_engine_foundation.sql), computing spend-per-outcome per channel per venture.
- Wiring: lib/marketing/venture-activation-gate.js imports and calls computeCpaGaugeState() (same direct-import pattern it already uses for computeGaugeState/computePaidGaugeState at line 34/115/171), citing the gauge's output in the venture_demand_verdicts row it writes (or in a chairman_decisions row via lib/eva/chairman-product-review.js) -- NOT a new decision table.
- PLAN-phase must resolve a substrate discrepancy flagged by validation-agent: lib/marketing/dashboard.js currently reads marketing_campaigns/marketing_channel_metrics (marketing_channel_metrics has no confirmed migration) while the true, migration-backed substrate is daily_rollups/marketing_attribution/channel_budgets. Verify live schema before choosing the gauge's read path.

OUT OF SCOPE (already built, cite and reuse, do not rebuild):
- A/B testing, variant assignment, or experiment infrastructure (lib/eva/experiments/*, lib/marketing/ai/thompson-sampler.js, marketing_content_variants table) -- fully exists.
- Any new decision-audit table -- venture_demand_verdicts already provides this, append-only with freeze triggers.
- Any outreach/contact-safety gate -- lib/governance/stage-gate-predicate.js (S24) + lib/eva/launch-mode.js already fully enforce this; this SD introduces zero new send/contact capability.
- lib/governance/gauge-registry.js -- this is a LEO-harness fleet-governance invariant registry (unranked-claimable-leaves, stale-tree, relay-drop, etc., routed to adam/solomon/coordinator/chairman), structurally the wrong home for a venture business metric. The new gauge is a plain module (cpa-gauge.mjs), not a registry entry.
- A dedicated "VP of marketing and sales" role/persona (raised as a question in the original roadmap item, not a build requirement) -- out of scope, not a LEO Protocol build item.`;

const key_changes = [
  {
    change: "Add lib/telemetry/cpa-gauge.mjs, a pure module exporting computeCpaGaugeState(), following the MEASURED/UNMEASURABLE (no_writer_yet/live/stale) idiom from lib/telemetry/funnel-gauge.mjs:43 computeGaugeState(), consuming channel_budgets + daily_rollups + marketing_attribution",
    impact: 'Gives EHG_Engineer its first honestly-measured per-channel per-venture cost-effectiveness signal, closing the gap Explore + validation-agent confirmed is the only genuinely missing piece of the originally-requested capability',
  },
  {
    change: "Wire computeCpaGaugeState() into lib/marketing/venture-activation-gate.js (same direct-import pattern already used for computeGaugeState/computePaidGaugeState), citing its output in the existing venture_demand_verdicts / chairman_decisions decision-audit surface instead of creating a new decision table",
    impact: "Satisfies the \"results feed the decision layer\" requirement from the original roadmap item without duplicating the already-shipped venture_demand_verdicts append-only audit trail, and without mis-registering a business metric into the LEO-harness-scoped gauge-registry.js",
  },
];

const mechanism_verifications = [
  { verified_by: 'lead-self-review', verified_at: 'lib/governance/gauge-registry.js:58' },
  { verified_by: 'lead-self-review', verified_at: 'lib/telemetry/funnel-gauge.mjs:43' },
  { verified_by: 'lead-self-review', verified_at: 'lib/marketing/venture-activation-gate.js:34' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260214_marketing_engine_foundation.sql:105' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260214_marketing_engine_foundation.sql:128' },
  { verified_by: 'validation-agent', verified_at: 'database/migrations/20260214_marketing_engine_foundation.sql:165' },
  { verified_by: 'validation-agent', verified_at: 'lib/eva/experiments/experiment-assignment.js:19' },
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
    lead_self_correction: {
      at: new Date().toISOString(),
      by: 'c29c1952-8d10-4a11-a71e-5ca637c41106',
      reason: 'Corrected gauge integration point before PRD authoring: gauge-registry.js is LEO-harness fleet-governance scoped, not venture-metrics scoped; the new gauge is a plain module (cpa-gauge.mjs) following funnel-gauge.mjs, not a registry entry',
    },
    mechanism_verifications,
  };

  const { data: updated, error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ description, scope, key_changes, metadata: newMetadata })
    .eq('id', sd.id)
    .select('id, sd_key, title')
    .single();

  if (updateErr) {
    console.error('UPDATE_FAILED', updateErr);
    process.exit(1);
  }

  console.log('CORRECTION_OK', JSON.stringify(updated, null, 2));
}

main();
