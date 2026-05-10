/**
 * Pre-Claim Cadence Gate
 *
 * Computes whether an SD's claim should be refused due to a PR-cadence /
 * stability-window requirement. Consumed by scripts/sd-start.js (refusal
 * point) and scripts/sd-next.js (CADENCE-WAIT badge display).
 *
 * SD-LEO-INFRA-PR-CADENCE-PRECLAIM-GATE-001
 *
 * SOURCE PRECEDENCE
 *   0. metadata.unlock_gate (typed event-based gate; SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001)
 *      When metadata.unlock_gate is a non-null object with string .type, and
 *      .type is NOT in CADENCE_REFUSAL_TYPES (the explicit allowlist of
 *      time-based refusal-eligible types), the gate short-circuits and
 *      returns source='unlock_gate_advisory' with active=false. The
 *      governance_metadata.next_workable_after timestamp is preserved on
 *      gate_until as advisory metadata, NOT as a refusal anchor. Closes 19th-
 *      candidate witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 where
 *      writers used next_workable_after for two semantics (PR-cadence stability
 *      window vs unlock_gate advisory milestone) and consumers treated them
 *      identically.
 *   1. governance_metadata.next_workable_after  (explicit ISO timestamp; wins)
 *   2. metadata.pr_cadence_minimum_days + last session_log entry
 *      (derived: lastActivity + minimumDays)
 *   3. Neither set → {active: false, source: 'none'} — opt-in by metadata presence
 *
 * UNLOCK_GATE VOCABULARY
 *   metadata.unlock_gate.type values observed in production (as of 2026-05-10):
 *     - 'usage_signal'   — chairman/operator usage-frequency trigger (advisory)
 *     - 'value_proof'    — phase-N-ships-and-proves-value trigger (advisory)
 *     - 'pr_cadence'     — explicit time-based PR cadence (refusal-eligible)
 *     - 'time_window'    — explicit time-window stability (refusal-eligible)
 *   When .type is one of the advisory values (or any value NOT in
 *   CADENCE_REFUSAL_TYPES), the cadence gate yields. Refusal-eligible types
 *   continue to fall through to Source 1/2 logic.
 *
 * SESSION_LOG NOTE
 *   session_log is the JSONB array at
 *   strategic_directives_v2.governance_metadata.session_log — NOT a separate
 *   table. The last entry's session_ended_at OR pr_merged_at is the lastActivity
 *   anchor for the derived path.
 *
 * @module lib/cadence/pre-claim-gate
 */

const MS_PER_DAY = 86400000;

/**
 * Allowlist of metadata.unlock_gate.type values that are refusal-eligible
 * (i.e., when one of these types is present, the cadence gate falls through to
 * the time-based refusal logic instead of yielding via the advisory path).
 *
 * Frozen Set for O(1) membership lookup and to prevent runtime mutation.
 * Pattern mirrors lib/sd-type-enum.js CANONICAL_SD_TYPES (precedent from
 * SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001).
 *
 * @type {ReadonlySet<string>}
 */
export const CADENCE_REFUSAL_TYPES = Object.freeze(new Set(['pr_cadence', 'time_window']));

/**
 * @typedef {Object} GateState
 * @property {boolean} active                Gate is currently in effect (claim should be refused)
 * @property {string|null} gate_until        ISO timestamp when gate expires (null when source='none')
 * @property {number|null} days_remaining    Whole days remaining (ceil); null when not active
 * @property {string} reason                 Operator-readable reason text
 * @property {'unlock_gate_advisory'|'next_workable_after'|'derived_from_session_log'|'none'} source
 */

/**
 * Compute cadence-gate state from SD metadata.
 *
 * @param {Object} input
 * @param {Object} [input.governance_metadata]      strategic_directives_v2.governance_metadata
 * @param {Object} [input.metadata]                 strategic_directives_v2.metadata
 * @param {Array}  [input.session_log]              Optional explicit session_log array (defaults to governance_metadata.session_log)
 * @param {number} [input.now]                      ms-since-epoch for current time (test injection; defaults to Date.now())
 * @returns {GateState}
 */
export function computeGateState({ governance_metadata, metadata, session_log, now } = {}) {
  const nowMs = typeof now === 'number' ? now : Date.now();
  const gm = governance_metadata || {};
  const md = metadata || {};

  // Source 0: metadata.unlock_gate vocabulary discriminator
  // When unlock_gate.type is present and NOT in the refusal-eligible allowlist,
  // the gate yields with source='unlock_gate_advisory'. The next_workable_after
  // timestamp (if any) is preserved on gate_until as advisory metadata.
  // SD-FDBK-ENH-CADENCE-VOCAB-DISCRIMINATOR-001
  const unlockGate = md.unlock_gate;
  if (unlockGate && typeof unlockGate === 'object' && typeof unlockGate.type === 'string') {
    if (!CADENCE_REFUSAL_TYPES.has(unlockGate.type)) {
      return {
        active: false,
        gate_until: typeof gm.next_workable_after === 'string' ? gm.next_workable_after : null,
        days_remaining: null,
        reason: `unlock_gate.type='${unlockGate.type}' is event-based (advisory). Cadence gate yields; surface as informational, not blocking.`,
        source: 'unlock_gate_advisory',
      };
    }
  }

  // Source 1: explicit next_workable_after ISO timestamp
  if (gm.next_workable_after) {
    const targetMs = parseIsoMs(gm.next_workable_after);
    if (targetMs !== null) {
      return buildGateState(targetMs, nowMs, gm.next_workable_after, 'next_workable_after');
    }
  }

  // Source 2: derived from session_log[last] + pr_cadence_minimum_days
  const minimumDays = toPositiveInteger(md.pr_cadence_minimum_days);
  const log = Array.isArray(session_log) ? session_log : (Array.isArray(gm.session_log) ? gm.session_log : []);
  if (minimumDays !== null && log.length > 0) {
    const last = log[log.length - 1] || {};
    const anchorIso = last.session_ended_at || last.pr_merged_at || null;
    const anchorMs = anchorIso ? parseIsoMs(anchorIso) : null;
    if (anchorMs !== null) {
      const targetMs = anchorMs + minimumDays * MS_PER_DAY;
      const targetIso = new Date(targetMs).toISOString();
      return buildGateState(targetMs, nowMs, targetIso, 'derived_from_session_log');
    }
  }

  return {
    active: false,
    gate_until: null,
    days_remaining: null,
    reason: 'No cadence metadata present (governance_metadata.next_workable_after AND metadata.pr_cadence_minimum_days both absent or unusable)',
    source: 'none',
  };
}

function buildGateState(targetMs, nowMs, gateUntilIso, source) {
  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) {
    return {
      active: false,
      gate_until: gateUntilIso,
      days_remaining: 0,
      reason: `Cadence window elapsed (${gateUntilIso}); claim allowed`,
      source,
    };
  }
  const daysRemaining = Math.ceil(remainingMs / MS_PER_DAY);
  return {
    active: true,
    gate_until: gateUntilIso,
    days_remaining: daysRemaining,
    reason: `PR cadence: ${daysRemaining} day(s) remaining until ${gateUntilIso}`,
    source,
  };
}

function parseIsoMs(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toPositiveInteger(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

/**
 * Format a refusal message for sd-start.js.
 *
 * @param {Object} input
 * @param {string} input.sdKey
 * @param {GateState} input.gateState
 * @returns {string}
 */
export function formatRefusalMessage({ sdKey, gateState }) {
  const dateOnly = (iso) => (iso || '').slice(0, 10);
  return [
    `PR cadence gate: ${sdKey} is in stability window`,
    `  source:     ${gateState.source}`,
    `  gate_until: ${dateOnly(gateState.gate_until)} (${gateState.days_remaining} day(s) remaining)`,
    `  reason:     ${gateState.reason}`,
    '',
    `To bypass with audit trail, supply ALL of:`,
    `  --override-cadence-gate "<reason>"`,
    `  --pattern-id <PAT-XXX>     (existing issue_patterns row)`,
    `  --followup-sd-key <SD-XXX> (alternative; existing strategic_directives_v2 row)`,
    '',
    `Mirrors --bypass-validation governance anchoring (scripts/modules/handoff/bypass-rubric.js).`,
  ].join('\n');
}
