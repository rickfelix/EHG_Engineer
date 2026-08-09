/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-7 — consent as a derived fact.
 *
 * Permission to email someone is DERIVED here from venture_consent_events ("the most recent event
 * for this recipient is an opt_in"), and is never read from a stored flag. The distinction is the
 * whole requirement:
 *
 *   A FLAG CAN BE SET. campaign_enrollments.status is a mutable TEXT column whose vocabulary
 *   includes 'unsubscribed'; any writer can flip it back to 'active', and nothing records that it
 *   happened. A derived permission cannot be set — changing it means recording another event,
 *   which leaves the prior one intact and readable.
 *
 *   A FLAG GOES STALE. email-campaigns.js processStep reads `enrollment.status` off the record its
 *   CALLER loaded. An opt-out arriving between load and send is invisible to it. That is the
 *   enroll-to-send gap, and it is the case that distinguishes a FRESH check from a CACHED one —
 *   so `resolveSendPermission` re-reads at send time, every time, by design and not by accident.
 *
 * @module lib/marketing/venture-consent
 */

/** Closed vocabulary — mirrors the CHECK in 20260809_venture_consent_events.sql. */
export const CONSENT_EVENT = Object.freeze({ OPT_IN: 'opt_in', OPT_OUT: 'opt_out' });

/** Why a send was refused. Distinct tokens, because "we never had permission" and "permission was
 *  withdrawn" are different facts about a person and the audit must not merge them. */
export const SEND_REFUSAL = Object.freeze({
  NO_CONSENT_ON_RECORD: 'NO_CONSENT_ON_RECORD',
  SUPPRESSED_BY_OPT_OUT: 'SUPPRESSED_BY_OPT_OUT',
  CONSENT_UNREADABLE: 'CONSENT_UNREADABLE',
  WITNESS_DOES_NOT_RESOLVE: 'WITNESS_DOES_NOT_RESOLVE',
});

/** Addresses are normalized at every boundary so two spellings of one person cannot disagree
 *  about whether that person consented. The DB CHECK enforces the same rule at rest. */
export function normalizeRecipient(email) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Record a real consent event. `provenance` is required and is not decoration — "someone
 * consented" is not a fact, "this form on this page" is. The caller never supplies occurred_at;
 * the database stamps it, because ordering decides permission and a backdated opt_in could
 * outrank a later opt_out and resurrect someone who unsubscribed.
 */
export async function recordConsentEvent({ supabase, ventureId, email, eventType, provenance, sourceRef = null }) {
  if (eventType !== CONSENT_EVENT.OPT_IN && eventType !== CONSENT_EVENT.OPT_OUT) {
    throw new Error(`recordConsentEvent: eventType must be opt_in or opt_out, got ${JSON.stringify(eventType)}`);
  }
  if (!provenance || !String(provenance).trim()) {
    throw new Error('recordConsentEvent: provenance is required — a consent record with no provenance is indistinguishable from an invented one');
  }
  const { data, error } = await supabase
    .from('venture_consent_events')
    .insert({
      venture_id: ventureId,
      recipient_email: normalizeRecipient(email),
      event_type: eventType,
      provenance: String(provenance).trim(),
      source_ref: sourceRef,
    })
    .select('id, occurred_at')
    .single();
  if (error) throw new Error(`recordConsentEvent failed: ${error.message}`);
  return data;
}

/**
 * THE SEND-TIME QUESTION. Read fresh, every send.
 *
 * Fails CLOSED in all three ways it can fail: an unreadable store, an absent history, and a
 * latest-event of opt_out all refuse. Note the default is REFUSAL — permission is something a
 * recipient granted, so its absence is not a neutral state.
 *
 * @returns {Promise<{permitted: boolean, reason: string|null, event: object|null}>}
 */
export async function resolveSendPermission({ supabase, ventureId, email }) {
  const recipient = normalizeRecipient(email);

  const { data, error } = await supabase
    .from('venture_consent_events')
    .select('id, event_type, provenance, occurred_at')
    .eq('venture_id', ventureId)
    .eq('recipient_email', recipient)
    .order('occurred_at', { ascending: false })
    .limit(1);

  if (error) {
    // "I could not look" is not "they consented".
    return { permitted: false, reason: SEND_REFUSAL.CONSENT_UNREADABLE, event: null, detail: error.message };
  }

  const latest = Array.isArray(data) ? data[0] : null;
  if (!latest) {
    return { permitted: false, reason: SEND_REFUSAL.NO_CONSENT_ON_RECORD, event: null };
  }
  if (latest.event_type === CONSENT_EVENT.OPT_OUT) {
    return { permitted: false, reason: SEND_REFUSAL.SUPPRESSED_BY_OPT_OUT, event: latest };
  }
  // Positively phrased: permission requires an explicit opt_in, so any unexpected value refuses
  // rather than falling through to permitted.
  if (latest.event_type === CONSENT_EVENT.OPT_IN) {
    return { permitted: true, reason: null, event: latest };
  }
  return { permitted: false, reason: SEND_REFUSAL.NO_CONSENT_ON_RECORD, event: latest };
}

/**
 * Resolve the AUP capture-record witness that guardSequenceSend names.
 *
 * Before this, the witness was satisfied by ANY non-empty string — a check a caller could satisfy
 * without changing the harm, which makes it silent. It must resolve to a genuine opt_in event for
 * this venture and this recipient: a witness that merely EXISTS is not a witness to the right
 * thing, so a real consent id belonging to a different person does not authorize this send.
 */
export async function resolveCaptureWitness({ supabase, captureRecordId, ventureId, email }) {
  if (!captureRecordId || typeof captureRecordId !== 'string' || captureRecordId.trim() === '') {
    return { resolved: false, reason: SEND_REFUSAL.WITNESS_DOES_NOT_RESOLVE, detail: 'no capture-record reference supplied' };
  }
  const { data, error } = await supabase
    .from('venture_consent_events')
    .select('id, event_type, venture_id, recipient_email, provenance')
    .eq('id', captureRecordId.trim())
    .maybeSingle();

  if (error) {
    return { resolved: false, reason: SEND_REFUSAL.CONSENT_UNREADABLE, detail: error.message };
  }
  if (!data) {
    return { resolved: false, reason: SEND_REFUSAL.WITNESS_DOES_NOT_RESOLVE, detail: 'capture-record reference resolves to no consent event — a well-formed id is not a captured opt-in' };
  }
  if (data.event_type !== CONSENT_EVENT.OPT_IN) {
    return { resolved: false, reason: SEND_REFUSAL.WITNESS_DOES_NOT_RESOLVE, detail: `capture record is an ${data.event_type}, not an opt_in` };
  }
  if (ventureId && data.venture_id !== ventureId) {
    return { resolved: false, reason: SEND_REFUSAL.WITNESS_DOES_NOT_RESOLVE, detail: 'capture record belongs to a different venture' };
  }
  if (email && data.recipient_email !== normalizeRecipient(email)) {
    return { resolved: false, reason: SEND_REFUSAL.WITNESS_DOES_NOT_RESOLVE, detail: 'capture record belongs to a different recipient' };
  }
  return { resolved: true, reason: null, event: data };
}

export default {
  CONSENT_EVENT,
  SEND_REFUSAL,
  normalizeRecipient,
  recordConsentEvent,
  resolveSendPermission,
  resolveCaptureWitness,
};
