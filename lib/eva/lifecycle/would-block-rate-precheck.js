/**
 * Would-block-rate promotion precheck.
 *
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-4).
 *
 * DISCLOSURE (testing-agent finding F5, independently confirmed by LEAD-phase
 * validation-agent's "zero hits: no live gauge, no scheduled drift sweep, no
 * would-block-rate implementation anywhere" finding): as of this SD, NO
 * consumer of this module exists anywhere in the codebase. This is AVAILABLE
 * INFRASTRUCTURE built ahead of the venture-wave/DEMAND-E packet's eventual
 * consumption — it does NOT wire an existing live caller. Wiring an actual
 * promotion-decision caller is explicitly out of scope for this SD.
 *
 * Any consumer computing a "would-block rate" for venture promotion decisions
 * MUST call precheckWouldBlockRate() first. If the conformance gauge
 * (lib/eva/lifecycle/gate-conformance.js) reports ANY unresolvable binding
 * gate string, this precheck REFUSES — the underlying gate data is not
 * trustworthy enough to compute a rate from.
 *
 * SCOPING (testing-agent finding, mutation-that-does-not-mutate risk): the
 * rate calculation is filtered to EXIT_GATE_* event types ONLY, via a single
 * exported constant list (RATE_SCOPED_EVENT_TYPES) built from
 * exit-gate-event-types.js — never an ad-hoc re-typed filter. system_events.
 * event_type='S19_HARD_GATE_BLOCK' alone has 139,000+ rows and fires ~120/hour
 * for a single venture; querying system_events unscoped would understate any
 * rate by roughly four orders of magnitude, always reading "safe to promote".
 * See tests/unit/eva/lifecycle/would-block-rate-precheck.test.js's
 * "TS-11 source-pinned" test, which uses a mock that GENUINELY applies the
 * .in() filter (not a canned array) so the test fails if the filter is removed.
 *
 * @module lib/eva/lifecycle/would-block-rate-precheck
 */

import { computeGateConformance } from './gate-conformance.js';
import { EXIT_GATE_ANOMALY, EXIT_GATE_OBSERVE_ONLY, EXIT_GATE_OBSERVE_UNRESOLVED } from './exit-gate-event-types.js';

/** The ONLY event types a would-block-rate calculation may count. Built from the shared
 * constants module — never independently re-typed. */
export const RATE_SCOPED_EVENT_TYPES = Object.freeze([
  EXIT_GATE_ANOMALY,
  EXIT_GATE_OBSERVE_ONLY,
  EXIT_GATE_OBSERVE_UNRESOLVED,
]);

/**
 * Query system_events for the scoped event types and compute a would-block rate.
 * A row counts as "would block" when its event_type is EXIT_GATE_ANOMALY (a binding
 * anomaly — inherently a block) or EXIT_GATE_OBSERVE_UNRESOLVED (an unresolvable
 * observe gate — treated as would-block, see exit-gate-enforcer.js's FR-3 comment),
 * or an EXIT_GATE_OBSERVE_ONLY row whose payload.would_satisfy === false.
 *
 * @param {Object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @returns {Promise<{total: number, wouldBlockCount: number, rate: number}>}
 */
export async function computeWouldBlockRate({ supabase }) {
  const { data, error } = await supabase
    .from('system_events')
    .select('event_type, payload')
    .in('event_type', RATE_SCOPED_EVENT_TYPES);
  if (error) throw new Error(`system_events query failed: ${error.message}`);
  const rows = data || [];
  const total = rows.length;
  const wouldBlockCount = rows.filter((r) =>
    r.event_type === EXIT_GATE_ANOMALY
    || r.event_type === EXIT_GATE_OBSERVE_UNRESOLVED
    || (r.event_type === EXIT_GATE_OBSERVE_ONLY && r.payload?.would_satisfy === false)
  ).length;
  return { total, wouldBlockCount, rate: total > 0 ? wouldBlockCount / total : 0 };
}

/**
 * The would-block-rate promotion precheck. Refuses (allowed:false) while any binding gate
 * string is unresolvable; otherwise computes the scoped rate.
 *
 * @param {Object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {Array} args.stages — venture_stages rows (live query result or fixture), passed to
 *   computeGateConformance. Callers with a live DB connection should query fresh rows here.
 * @returns {Promise<{allowed: boolean, reason: string, conformance: Object, total?: number, wouldBlockCount?: number, rate?: number}>}
 */
export async function precheckWouldBlockRate({ supabase, stages }) {
  const conformance = computeGateConformance(stages);
  if (conformance.unresolvableCount > 0) {
    const list = conformance.unresolvableBinding.map((e) => `S${e.stage}: "${e.gateString}"`).join('; ');
    return {
      allowed: false,
      reason: `Would-block-rate precheck refused: ${conformance.unresolvableCount} binding gate string(s) `
        + `unresolvable — a rate computed now would be untrustworthy. Unresolved: ${list}`,
      conformance,
    };
  }
  const rateResult = await computeWouldBlockRate({ supabase });
  return { allowed: true, reason: '', conformance, ...rateResult };
}
