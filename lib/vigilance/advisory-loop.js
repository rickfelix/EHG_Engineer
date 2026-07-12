/**
 * Reprioritization advisory loop to Adam sourcing — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F FR-2.
 *
 * ADVICE ONLY — never auto-reprioritization (docs/03_protocols_and_standards/only-the-chairman-can.md
 * doctrine: no-auto-override, hold-and-surface). Reuses lib/sourcing-engine/escalator.js's
 * escalateToChairmanQueue/buildQueueRow UNMODIFIED — that function already accepts a
 * non-router-shaped item via its opts.gateType/escalationType/extraContext overrides, so a
 * vigilance-originated advisory can use the SAME idempotent (source_id, gate_type) queue without
 * touching escalator.js or colliding with router-originated rows (distinct gate_type).
 * LANE.OUTCOME_GATED is used (not CHAIRMAN_GATED) — a reprioritization signal is evidence toward
 * a future decision, not an authority-grant request.
 */
import { escalateToChairmanQueue } from '../sourcing-engine/escalator.js';
import { LANE } from '../sourcing-engine/lane.js';

const GATE_TYPE = 'vigilance_reprioritization';

/**
 * Send a typed reprioritization advisory derived from a vigilance observation. Fail-soft
 * (never throws) — mirrors escalateToChairmanQueue's own dormant-table tolerance.
 *
 * @param {object} observation - a written portfolio_evidence row (has .id)
 * @param {{ supabase: object, nowIso?: string, summary?: string }} deps
 * @returns {Promise<{escalated:boolean, reason?:string, id?:string|null, deduped?:boolean}>}
 */
export async function sendReprioritizationAdvisory(observation, deps) {
  if (!observation || !observation.id) {
    return { escalated: false, reason: 'no_observation_id' };
  }
  const item = {
    source_id: observation.id,
    title: deps.summary || observation.payload?.summary || `Vigilance observation on ${observation.subject_id ?? observation.subject_type ?? 'unknown subject'}`,
  };
  const routed = {
    lane: LANE.OUTCOME_GATED,
    escalation: { reason: 'vigilance_reprioritization' },
  };
  return escalateToChairmanQueue(item, routed, {
    supabase: deps.supabase,
    nowIso: deps.nowIso,
    gateType: GATE_TYPE,
    escalationType: GATE_TYPE,
    extraContext: {
      observation_id: observation.id,
      subject_type: observation.subject_type ?? null,
      subject_id: observation.subject_id ?? null,
      thesis: observation.payload?.thesis ?? null,
      source_module: 'vigilance_loop',
    },
  });
}

export { GATE_TYPE };
