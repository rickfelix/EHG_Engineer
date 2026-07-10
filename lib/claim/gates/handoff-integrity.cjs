/**
 * Shared handoff-integrity gate — relocated verbatim from scripts/sd-start.js
 * (SD-ARCH-HOTSPOT-SD-START-001 FR-3). Checks the LAST sd_phase_handoffs row for
 * an SD before resume so a rejected-and-unresolved handoff surfaces instead of
 * being silently built past.
 *
 * Pure verdict function: no console (prospective-testing D9 — the sd-start
 * caller passes onWarn to keep its loud QF-20260609-564 error surfacing), no
 * process.exit, no argv. Fail-OPEN on query error (the consumer hard-exits on
 * valid:false without --force, so a transient DB hiccup must not block resume).
 *
 * Verdict shape varies by path (D9, documented):
 *   query error   → { valid:true,  lastHandoff:null, message, recoveryOptions:[] }        (no `status`)
 *   no handoffs   → { valid:false, lastHandoff:null, status:'missing', message, recoveryOptions }
 *   accepted      → { valid:true,  lastHandoff, status, message, recoveryOptions:[] }
 *   resolved      → { valid:true,  lastHandoff, status:'resolved', message, recoveryOptions:[] }
 *   rejected      → { valid:false, lastHandoff, status, message, reason, recoveryOptions }  (adds `reason`)
 *
 * @module lib/claim/gates/handoff-integrity
 */
'use strict';

/**
 * @param {object} supabase - service client
 * @param {string} sdUuid - the SD UUID (sd_phase_handoffs is keyed by sd_id — QF-20260609-564:
 *   the prior sd-start query filtered a non-existent text-key column and silently disabled
 *   this whole check; the sd_id keying here IS the fix, preserved verbatim)
 * @param {{onWarn?: (msg: string) => void}} [opts]
 */
async function verifyHandoffIntegrity(supabase, sdUuid, { onWarn } = {}) {
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, status, created_at, rejection_reason, resolved_at')
    .eq('sd_id', sdUuid)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    // QF-20260609-564: surface the error instead of silently swallowing it. Stay fail-open,
    // but report loudly (via the caller's onWarn) so a real/persistent query error can never
    // hide again the way the dead-column bug did.
    if (typeof onWarn === 'function') {
      onWarn(`verifyHandoffIntegrity: handoff query failed (${error.code || 'error'}: ${error.message}) — proceeding without integrity check`);
    }
    return { valid: true, lastHandoff: null, message: `Could not query handoffs: ${error.message} (proceeding)`, recoveryOptions: [] };
  }

  if (!handoffs || handoffs.length === 0) {
    return {
      valid: false,
      lastHandoff: null,
      status: 'missing',
      message: 'No prior handoff found',
      recoveryOptions: [
        'Run the appropriate handoff for this phase',
        'Use --force flag to proceed without handoff verification',
      ],
    };
  }

  const last = handoffs[0];

  if (last.status === 'accepted' || last.status === 'completed') {
    return {
      valid: true,
      lastHandoff: last,
      status: last.status,
      message: `Last handoff: ${last.status} (${last.from_phase} → ${last.to_phase})`,
      recoveryOptions: [],
    };
  }

  // Handoff was rejected or failed — but check if it was already resolved
  if (last.resolved_at) {
    return {
      valid: true,
      lastHandoff: last,
      status: 'resolved',
      message: `Last handoff ${last.status} but resolved at ${new Date(last.resolved_at).toLocaleString()} (${last.from_phase} → ${last.to_phase})`,
      recoveryOptions: [],
    };
  }

  const reason = last.rejection_reason || 'No reason provided';
  return {
    valid: false,
    lastHandoff: last,
    status: last.status,
    message: `Last handoff ${last.status}: ${last.from_phase} → ${last.to_phase}`,
    reason,
    recoveryOptions: [
      `View handoff details: node -e "..." (handoff ID: ${last.id})`,
      `Re-run the ${last.from_phase} → ${last.to_phase} handoff after addressing issues`,
      'Use --force flag to override and continue (not recommended)',
    ],
  };
}

module.exports = { verifyHandoffIntegrity };
