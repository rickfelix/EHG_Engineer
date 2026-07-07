/**
 * Door-routing cost ledger writer (SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 FR-4).
 * FIRE-AND-FORGET: a ledger failure must never block a dispatch (posture parity
 * with lib/llm/usage-logger.js). Inert unless DOOR_ROUTING_ENABLED. Column naming
 * follows the venture_token_ledger precedent (model_id, cost_usd).
 *
 * V1 COVERAGE NOTE (stated on every row): this measures the ROUTING surface —
 * which door/tier/model each item was routed to — not full delegate token usage;
 * per-token attribution follows once delegate sessions report usage upstream.
 */
'use strict';

const { isDoorRoutingEnabled } = require('./door-constants.cjs');

// SD-LEO-INFRA-OPERATIONALIZE-FABLE-USE-001 (FR-5): current_phase -> a coarse funnel-position
// proxy (LEAD=selection, PLAN=design, everything else=detailing). Documented as an explicit
// approximation (PRD risk) — good enough to surface the doctrine's already-observed gross bias,
// not a precise instrument.
const FUNNEL_POSITION_BY_PHASE = { LEAD: 'selection', PLAN: 'design' };

/** Derive an FR-5 funnel_position from an SD's current_phase. Exported for tests. */
function funnelPositionForPhase(currentPhase) {
  const phase = String(currentPhase || '').toUpperCase();
  if (phase.startsWith('LEAD')) return FUNNEL_POSITION_BY_PHASE.LEAD;
  if (phase.startsWith('PLAN')) return FUNNEL_POSITION_BY_PHASE.PLAN;
  if (phase) return 'detailing';
  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} entry — { work_key, door, delegate_model, tier_rank,
 *                           tokens_input?, tokens_output?, cost_usd?, model_id?,
 *                           r_criterion?, funnel_position? }
 * @param {Object} [logger=console]
 * @returns {Promise<{written: boolean, error: string|null}>} never throws
 */
async function writeDoorRoutingLedger(supabase, entry, logger = console) {
  try {
    if (!isDoorRoutingEnabled()) return { written: false, error: null };
    if (!supabase || !entry || !entry.work_key || !entry.door) {
      return { written: false, error: 'invalid_entry' };
    }
    const row = {
      work_key: entry.work_key,
      door: entry.door,
      delegate_model: entry.delegate_model ?? null,
      tier_rank: Number.isFinite(Number(entry.tier_rank)) ? Number(entry.tier_rank) : null,
      tokens_input: Number.isFinite(Number(entry.tokens_input)) ? Number(entry.tokens_input) : null,
      tokens_output: Number.isFinite(Number(entry.tokens_output)) ? Number(entry.tokens_output) : null,
      cost_usd: Number.isFinite(Number(entry.cost_usd)) ? Number(entry.cost_usd) : null,
      model_id: entry.model_id ?? null,
      // FR-5: additive, nullable — absent on every pre-existing caller (byte-identical elsewhere).
      r_criterion: entry.r_criterion ?? null,
      funnel_position: entry.funnel_position ?? null,
      coverage_note: 'v1 routing surface (not full delegate usage)',
      routed_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('door_routing_ledger').insert(row);
    if (error) {
      logger && logger.warn && logger.warn('[door-ledger] write failed (fire-and-forget): ' + error.message);
      return { written: false, error: error.message };
    }
    return { written: true, error: null };
  } catch (e) {
    logger && logger.warn && logger.warn('[door-ledger] swallowed (fire-and-forget): ' + (e && e.message));
    return { written: false, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { writeDoorRoutingLedger, funnelPositionForPhase, FUNNEL_POSITION_BY_PHASE };
