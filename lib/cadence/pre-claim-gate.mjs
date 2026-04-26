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
 *   1. governance_metadata.next_workable_after  (explicit ISO timestamp; wins)
 *   2. metadata.pr_cadence_minimum_days + last session_log entry
 *      (derived: lastActivity + minimumDays)
 *   3. Neither set → {active: false, source: 'none'} — opt-in by metadata presence
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
 * @typedef {Object} GateState
 * @property {boolean} active                Gate is currently in effect (claim should be refused)
 * @property {string|null} gate_until        ISO timestamp when gate expires (null when source='none')
 * @property {number|null} days_remaining    Whole days remaining (ceil); null when not active
 * @property {string} reason                 Operator-readable reason text
 * @property {'next_workable_after'|'derived_from_session_log'|'none'} source
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
