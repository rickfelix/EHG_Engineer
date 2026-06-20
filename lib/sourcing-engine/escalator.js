/**
 * Sourcing-engine chairman decision-queue escalator.
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-CHAIRMAN-QUEUE-001 (FR-2 / FR-3) — child 4/10.
 *
 * Consumes the router's routeCandidate output (lib/sourcing-engine/router.js) and, for a candidate
 * laned chairman-gated or outcome-gated, writes ONE tracked decision row to sourcing_chairman_queue
 * (database/migrations/20260620_sourcing_chairman_queue.sql) with an SLA + state='pending'. Idempotent
 * on (source_id, gate_type). Fail-soft while the table is DORMANT (not yet applied) — never throws.
 */
import { LANE } from './lane.js';

/** Default decision SLA windows (hours), by gate. Declared here; the reader (chairman/Adam) enforces. */
export const DEFAULT_SLA_HOURS = Object.freeze({
  [LANE.CHAIRMAN_GATED]: 72,   // 3 days for an authority grant (grant/rls/credential/operational/vision)
  [LANE.OUTCOME_GATED]: 168,   // 7 days — waits on an operational outcome before it is buildable
});

/** The two router lanes that land in the chairman decision queue. */
export const QUEUE_LANES = Object.freeze([LANE.CHAIRMAN_GATED, LANE.OUTCOME_GATED]);

// Table/column-absent codes (PostgREST PGRST205/204, Postgres 42P01) => the migration is DORMANT; fail-soft.
const DORMANT_CODES = new Set(['PGRST205', 'PGRST204', '42P01']);

/**
 * Build the chairman-queue row for a routed candidate, or null if its lane is not a queue lane.
 * PURE — no IO. `item` is the classified candidate (source_id/title); `routed` is routeCandidate output.
 *
 * OVERRIDES (backward-compatible — all default to the original lane-derived behavior; added for the
 * outcome-decomposer child 7, which queues a DISTINCT gate_type so its proposal row coexists with this
 * escalator's plain outcome-gated row for the same source_id under the (source_id, gate_type) key):
 *   - opts.gateType        : override the gate_type column (default = lane)
 *   - opts.escalationType  : override escalation_type (default = authority reason / 'outcome')
 *   - opts.extraContext    : shallow-merged into the context jsonb (e.g. proposed_enablers)
 *
 * @param {{source_id?:string, title?:string}} item
 * @param {{lane?:string, rung?:string|null, disposition?:string|null, escalation?:object, enablers?:string[]}} routed
 * @param {{slaHours?:number, gateType?:string, escalationType?:string, extraContext?:object}} [opts]
 * @returns {object|null}
 */
export function buildQueueRow(item = {}, routed = {}, opts = {}) {
  const lane = routed && routed.lane;
  if (!QUEUE_LANES.includes(lane)) return null;
  // Overrides are accepted only as NON-EMPTY strings — an empty gate_type would be non-null in SQL and
  // silently collide every row on (source_id, '') under the UNIQUE idempotency key.
  const hasGateType = typeof opts.gateType === 'string' && opts.gateType !== '';
  const hasEscType = typeof opts.escalationType === 'string' && opts.escalationType !== '';
  const escalation_type = hasEscType
    ? opts.escalationType
    : (lane === LANE.CHAIRMAN_GATED
        ? ((routed.escalation && routed.escalation.reason) || 'chairman')
        : 'outcome');
  const gate_type = hasGateType ? opts.gateType : lane;
  const slaHours = opts.slaHours != null ? opts.slaHours : DEFAULT_SLA_HOURS[lane];
  return {
    source_id: item.source_id != null ? item.source_id : null,
    title: item.title != null ? item.title : null,
    lane,
    gate_type,
    escalation_type,
    context: {
      // extraContext spreads FIRST so the routed-derived base keys (rung/disposition/escalation/enablers)
      // always win on a key collision — extras can only ADD fields, never clobber the canonical payload.
      ...(opts.extraContext && typeof opts.extraContext === 'object' ? opts.extraContext : {}),
      rung: routed.rung != null ? routed.rung : null,
      disposition: routed.disposition != null ? routed.disposition : null,
      escalation: routed.escalation || null,
      enablers: Array.isArray(routed.enablers) ? routed.enablers : [],
    },
    sla_hours: slaHours != null ? slaHours : null,
    state: 'pending',
  };
}

/**
 * Escalate a routed candidate to the chairman queue (idempotent upsert). NEVER throws; returns a
 * verdict object. Fail-soft when the client is missing or the table is absent (DORMANT).
 * @param {object} item   - classified candidate (source_id/title)
 * @param {object} routed - routeCandidate output
 * @param {{ supabase?:object, nowIso?:string, slaHours?:number, gateType?:string, escalationType?:string, extraContext?:object }} [deps]
 * @returns {Promise<{escalated:boolean, reason?:string, id?:string|null, deduped?:boolean, degraded?:boolean, error?:string}>}
 */
export async function escalateToChairmanQueue(item, routed, deps = {}) {
  const row = buildQueueRow(item, routed, {
    slaHours: deps.slaHours,
    gateType: deps.gateType,
    escalationType: deps.escalationType,
    extraContext: deps.extraContext,
  });
  if (!row) return { escalated: false, reason: 'not_a_gated_lane' };
  // Idempotency depends on UNIQUE (source_id, gate_type); in Postgres NULL != NULL, so a null
  // source_id would defeat the upsert conflict and re-insert on every router pass. Refuse it loudly
  // — a real candidate always carries a source ref (conversion_ledger / roadmap id).
  if (row.source_id == null || row.source_id === '') return { escalated: false, reason: 'no_source_id' };
  const supabase = deps.supabase;
  if (!supabase) return { escalated: false, reason: 'no_client' };
  if (row.sla_hours != null) {
    const now = deps.nowIso ? new Date(deps.nowIso) : new Date();
    row.sla_due_at = new Date(now.getTime() + row.sla_hours * 3600 * 1000).toISOString();
  }
  let data, error;
  try {
    ({ data, error } = await supabase
      .from('sourcing_chairman_queue')
      .upsert(row, { onConflict: 'source_id,gate_type', ignoreDuplicates: true })
      .select('id'));
  } catch (e) {
    return { escalated: false, reason: 'threw', degraded: true, error: e && e.message };
  }
  if (error) {
    if (DORMANT_CODES.has(error.code) || /Could not find the table|does not exist/i.test(error.message || '')) {
      return { escalated: false, reason: 'table_absent_dormant', degraded: true };
    }
    return { escalated: false, reason: 'error', error: error.message };
  }
  // With ignoreDuplicates, a conflict returns no row — still a success (the item is already queued).
  const id = data && data[0] && data[0].id;
  return { escalated: true, id: id || null, deduped: !id };
}
