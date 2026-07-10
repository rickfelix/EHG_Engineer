/**
 * Shared cadence gate ADAPTER — SD-ARCH-HOTSPOT-SD-START-001 FR-4.
 *
 * lib/cadence/pre-claim-gate.mjs (computeGateState/formatRefusalMessage) stays the
 * cadence SSOT — this module adapts it (plus the bypass-rubric override validation
 * and the CADENCE_GATE_* audit contract that sd-start previously inlined at L649)
 * into a pure-verdict gate. The audit writes ARE part of the gate's contract
 * (refusals are recorded; an override that cannot be audit-logged is REFUSED —
 * fail-closed, preserved verbatim), so they live here; console/colors/exit and
 * argv parsing stay in the sd-start caller.
 *
 * Loaded from ESM (sd-start) via createRequire; ESM-only dependencies are pulled
 * with await import() (a .cjs module cannot require() ESM synchronously).
 *
 * Verdict outcomes:
 *   { allowed:true,  outcome:'inactive' }                                        gate not active
 *   { allowed:false, outcome:'refused', state, refusalMessage, shortOverride,
 *     auditRecorded, auditError? }                                               no/short override (refusal audit best-effort)
 *   { allowed:false, outcome:'override_rejected', state, message }               bypass-rubric shape refused
 *   { allowed:false, outcome:'audit_unavailable_fail_closed', state, auditError } override valid but unrecordable
 *   { allowed:true,  outcome:'override_accepted', state, overrideReason,
 *     patternRef }                                                               valid + audit-logged override
 *
 * @module lib/claim/gates/cadence-gate
 */
'use strict';

/**
 * @param {object} supabase - service client
 * @param {object} sd - SD row carrying governance_metadata + metadata + id
 * @param {object} [opts]
 * @param {string} [opts.sdKey] - display key for messages/audit (defaults to sd.sd_key)
 * @param {string|null} [opts.overrideReason] - the --override-cadence-gate value (caller-parsed)
 * @param {string|null} [opts.patternId] - the --pattern-id value
 * @param {string|null} [opts.followupSdKey] - the --followup-sd-key value
 * @param {string|null} [opts.sessionId] - operator session id for audit rows (caller-supplied;
 *   this module reads no env — prospective-testing hidden-coupling rule)
 */
async function evaluateCadenceGate(supabase, sd, {
  sdKey = (sd && sd.sd_key) || null,
  overrideReason = null,
  patternId = null,
  followupSdKey = null,
  sessionId = null,
} = {}) {
  const { computeGateState, formatRefusalMessage } = await import('../../cadence/pre-claim-gate.mjs');
  const gateState = computeGateState({
    governance_metadata: sd.governance_metadata,
    metadata: sd.metadata,
  });

  if (!gateState.active) return { allowed: true, outcome: 'inactive' };

  if (!overrideReason || overrideReason.length < 20) {
    // Refusal: audit best-effort (a failed refusal record is non-blocking, verbatim
    // from the sd-start inline gate), then the caller prints + exits.
    let auditRecorded = true;
    let auditError = null;
    try {
      const { error } = await supabase.from('audit_log').insert({
        event_type: 'CADENCE_GATE_REFUSED',
        entity_type: 'strategic_directive',
        entity_id: sd.id,
        metadata: {
          sd_key: sdKey,
          gate_until: gateState.gate_until,
          days_remaining: gateState.days_remaining,
          source: gateState.source,
          override_attempted: overrideReason !== null,
          override_reason: overrideReason,
          operator_session_id: sessionId,
        },
        severity: 'info',
      });
      if (error) { auditRecorded = false; auditError = error.message; }
    } catch (auditErr) {
      auditRecorded = false;
      auditError = auditErr.message;
    }
    return {
      allowed: false,
      outcome: 'refused',
      state: gateState,
      refusalMessage: formatRefusalMessage({ sdKey, gateState }),
      shortOverride: Boolean(overrideReason && overrideReason.length < 20),
      overrideReasonLength: overrideReason ? overrideReason.length : 0,
      auditRecorded,
      ...(auditError ? { auditError } : {}),
    };
  }

  const { validateBypassShape } = await import('../../../scripts/modules/handoff/bypass-rubric.js');
  const shapeResult = await validateBypassShape({
    patternId,
    followupSdKey,
    supabase,
    bypassReason: overrideReason,
    sdId: sd.id,
    handoffType: 'sd_start_cadence_override',
  });
  if (!shapeResult.allowed) {
    return { allowed: false, outcome: 'override_rejected', state: gateState, message: shapeResult.message };
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    event_type: 'CADENCE_GATE_OVERRIDE',
    entity_type: 'strategic_directive',
    entity_id: sd.id,
    metadata: {
      sd_key: sdKey,
      gate_until: gateState.gate_until,
      days_remaining: gateState.days_remaining,
      source: gateState.source,
      override_reason: overrideReason,
      pattern_id: patternId,
      followup_sd_key: followupSdKey,
      operator_session_id: sessionId,
    },
    severity: 'warning',
  });
  if (auditErr) {
    // Fail-closed, verbatim: an override that cannot be safely recorded is refused.
    return { allowed: false, outcome: 'audit_unavailable_fail_closed', state: gateState, auditError: auditErr.message };
  }

  return {
    allowed: true,
    outcome: 'override_accepted',
    state: gateState,
    overrideReason,
    patternRef: patternId || followupSdKey,
  };
}

module.exports = { evaluateCadenceGate };
