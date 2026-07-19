/**
 * apex-framing-objective.mjs — SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-1).
 *
 * The apex-framing role's objective function as a GOVERNED SPINE §3.3 ROW
 * (FW-3 design docs/design/fw3-effort-distribution-tier-design.md §4/§5):
 * CMV is singular — one north-star, one "better" — so the apex's objective
 * recurses INTO the existing org objective/guard registry, never a satellite
 * or peer store. Content is DECISION-QUALITY, never effort/cost; the paired
 * anti-Goodhart guards make a drifting apex (low decline-rate, dissent-killing
 * convergence) loudly visible.
 *
 * SEEDING CAVEAT (VALIDATION LEAD finding, this SD): the substrate constraint
 * is a plain UNIQUE (venture_id, objective_key) WITHOUT `NULLS NOT DISTINCT`,
 * and the apex objective is system-scope (venture_id NULL). Under Postgres
 * NULLs-distinct semantics registerObjective's onConflict upsert never matches
 * an existing NULL-venture row and would INSERT A DUPLICATE on every re-seed.
 * So the objective row is seeded SELECT-FIRST (insert only when absent).
 * Guards use registerGuard as-is — guard_key is globally UNIQUE NOT NULL, so
 * that upsert is genuinely idempotent.
 *
 * House convention: `supabase` is dependency-injected; this module never
 * constructs a client (mirrors lib/org/objective-guard-registry.mjs).
 */

import { registerGuard, MODES } from './objective-guard-registry.mjs';

export const APEX_OBJECTIVE_KEY = 'apex-framing-decision-quality';

/** Design §5 verbatim intent: four components + the explicit anti-objective. */
export const APEX_OBJECTIVE_STATEMENT =
  "Apex-framing 'better' is DECISION QUALITY, never effort/cost: " +
  '(1) surfaced negative-space the below-flow would have missed; ' +
  '(2) the escalate-predicate calibrated SYMMETRICALLY — false-escalations AND ' +
  'missed-escalations are the error signal (bi-directional anti-Goodhart); ' +
  '(3) the mental-model compounded and got reused (the learning-moat); ' +
  '(4) traced honestly to CMV, not post-hoc rationalization. ' +
  "Explicitly NOT 'which framings shipped value' — that naive RL signal trains " +
  'the apex to stop being an apex (throughput/easy-ship drift elevated to the top).';

/** Gauge DOWNSTREAM only — intrinsic gauging is the gauge-vs-action divergence at the apex. */
export const APEX_OBJECTIVE_METRIC =
  'downstream-only: the hand-down produced a sourced SD that proved out; ' +
  'never framings-emitted, panel-converged, or tokens-saved (intrinsic gauging forbidden).';

export const APEX_GUARDS = Object.freeze([
  {
    guardKey: 'apex-framing-decline-rate-high',
    guardType: 'anti_goodhart',
    predicateDescription:
      'DECLINE-rate must stay HIGH: a low-decline apex is drifting — it should refuse ' +
      'most problems down to the floor. Trips when the metric claims target met while ' +
      'gaming signals (e.g. framings-emitted throughput) are present.',
    mode: MODES.ADVISORY,
  },
  {
    guardKey: 'apex-framing-dissent-preservation',
    guardType: 'anti_goodhart',
    predicateDescription:
      'DISSENT-preservation-rate: a panel optimizing for agreement kills the ' +
      'negative-space buy. Trips when claimed alignment coexists with gaming signals ' +
      '(dissent suppressed / rubber-stamp convergence).',
    mode: MODES.ADVISORY,
  },
]);

/**
 * Idempotently seed the apex-framing objective + guards.
 * Objective: SELECT-first insert (NULL-venture row, see module header).
 * Guards: registerGuard upsert (conflict-keyed on globally-unique guard_key).
 *
 * @param {object} supabase - injected service-role client
 * @returns {Promise<{objectiveSeeded: boolean, objectiveKey: string, guardKeys: string[]}>}
 */
export async function seedApexFramingObjective(supabase) {
  const { data: existing, error: readErr } = await supabase
    .from('org_objective_registry')
    .select('id')
    .is('venture_id', null)
    .eq('objective_key', APEX_OBJECTIVE_KEY)
    .limit(1);
  if (readErr) throw new Error(`apex objective pre-read failed: ${readErr.message}`);

  let objectiveSeeded = false;
  if (!Array.isArray(existing) || existing.length === 0) {
    const { error: insErr } = await supabase.from('org_objective_registry').insert({
      venture_id: null,
      objective_key: APEX_OBJECTIVE_KEY,
      statement: APEX_OBJECTIVE_STATEMENT,
      metric: APEX_OBJECTIVE_METRIC,
      target: null,
      mode: MODES.ADVISORY,
      created_by: 'seed-apex-framing-objective',
    });
    if (insErr) throw new Error(`apex objective insert failed: ${insErr.message}`);
    objectiveSeeded = true;
  }

  for (const g of APEX_GUARDS) {
    await registerGuard(supabase, { objectiveKey: APEX_OBJECTIVE_KEY, ...g });
  }

  return {
    objectiveSeeded,
    objectiveKey: APEX_OBJECTIVE_KEY,
    guardKeys: APEX_GUARDS.map((g) => g.guardKey),
  };
}
