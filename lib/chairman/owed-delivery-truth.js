/**
 * Owed-state delivery-truth writer for outbound SMS. Extracted from api/webhooks/twilio-sms.js
 * (SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3/TR-6) so both the legacy direct Twilio webhook AND
 * the new relay-staged drain (lib/chairman/sms-bridge.js:drainSmsStatusStaging) can call the same
 * writer without an api/ -> lib/ import cycle (api/webhooks/twilio-sms.js already imports FROM
 * lib/chairman/sms-bridge.js for handleInboundSmsReply — a lib/ file importing an api/ file would
 * have been the first of its kind in this codebase).
 *
 * SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3/TR-2/TR-5 (prospective TESTING findings C2/C3/C4,
 * sub_agent_execution_results cbcb68fa-d415-426c-93b8-6e61f4a044fc): `source` and `deliveredAt`
 * are REQUIRED parameters with no default — Pass 1c (lib/chairman/sms-outbound-worker.js) never
 * called this function and was never a caller to preserve a default for; the one real existing
 * caller (handleTwilioStatusCallback) is itself a carrier push, so a "safe" default would have
 * silently mislabeled it. The function returns a structured outcome ({matched, updated, error})
 * instead of void, so a caller (the drain) can branch on matched/updated/no-match/error rather
 * than guessing from side effects.
 */

// SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-2: map a Twilio MessageStatus onto the owed-row
// state change — delivery-truth, keyed to provider_message_id (the Twilio SID). A 201-accept
// alone is 'queued'/'sending'/'sent' and NEVER sets delivered_at; delivered is the ONLY status
// that stamps delivered_at; undelivered/failed flip the row onto the reconcile/retry/alert path.
// Transient statuses return null => no owed-row write (the row stays on its send path).
export function owedRowUpdateForStatus(status, deliveredAtIso, source) {
  if (status === 'delivered') return { status: 'delivered', delivered_at: deliveredAtIso, delivery_status_source: source };
  if (status === 'undelivered') return { status: 'undelivered' };
  if (status === 'failed') return { status: 'failed' };
  return null; // queued/sending/sent — transient, leave the owed row on its send path
}

// Twilio message SIDs are alphanumeric (e.g. "SM<32 hex chars>"); this codebase's own test
// fixtures also use a hyphenated fake-SID convention (e.g. "SM-SENT-1"), so hyphens are allowed
// too. Validated before use in a hand-built PostgREST .or() filter string (defense in depth —
// the caller's own signature check already guarantees this value is genuinely from Twilio, since
// params are HMAC-signed with the auth token; this guard just keeps the filter string well-formed).
const VALID_MESSAGE_SID = /^[A-Za-z0-9-]+$/;

/**
 * Stamp delivery-truth onto the owed obligation row matched by provider_message_id, OR
 * (SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A Solomon Pin #2) — for a 'delivered' callback ONLY — by
 * containment in prior_provider_message_ids. A resend preserves the ORIGINAL SID there, so a late
 * 'delivered' callback for it still resolves against this row instead of silently no-op'ing once
 * provider_message_id was overwritten by the newest attempt: delivery-truth achieved by ANY
 * attempt satisfies the obligation, no matter which SID confirms it.
 *
 * PRIOR-SID SCOPE: a 'undelivered'/'failed' callback is matched ONLY against the CURRENT
 * provider_message_id, never against prior_provider_message_ids. A superseded (pre-resend)
 * attempt's late failure tells us nothing about the newer attempt actively in flight — applying
 * it there would wrongly terminate a row whose current send may still succeed.
 *
 * STATUS GUARD: excludes rows already 'delivered' or 'canceled' — a late/duplicate callback for
 * a SID the row has EVER carried must never regress an already-correct terminal state.
 *
 * FAIL-SOFT: while the STAGED sms_outbound_obligations migration is unapplied the table is
 * absent (42P01/PGRST205) and this degrades to a no-op and never crashes the caller. A missing
 * delivery_status_source column (PGRST204 — SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3/FR-4
 * deployment-ordering guard) is reported distinctly in the return value so a caller (the drain)
 * can choose NOT to mark its own work claimed/complete, unlike the table-absent case. Any OTHER
 * error (QF-20260822-215 — same discard class as SD-LEO-FIX-SMS-OUTBOUND-WORKER-002) is a genuine
 * write failure and is returned, never silently swallowed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{messageSid: string, status: string, deliveredAt: string, source: 'carrier_push'|'carrier_poll'|'local_clock_fallback'}} args
 *   deliveredAt: ISO timestamp for the delivery event, supplied by the CALLER — never
 *   synthesized here — so a caller that only learns about a delivery later (e.g. a staging
 *   drain) can pass the actual event time instead of the write-time.
 *   source: the delivery_status_source discriminator, required (see file header).
 * @returns {Promise<{matched: boolean, updated: boolean, error: Error|null, tableAbsent: boolean, columnAbsent: boolean}>}
 */
export async function applyOwedDeliveryTruth(supabase, { messageSid, status, deliveredAt, source }) {
  const patch = owedRowUpdateForStatus(status, deliveredAt, source);
  if (!patch || !VALID_MESSAGE_SID.test(messageSid || '')) {
    return { matched: false, updated: false, error: null, tableAbsent: false, columnAbsent: false };
  }
  // 'delivered' may resolve via prior-SID history (any attempt delivering satisfies the
  // obligation); 'undelivered'/'failed' is scoped to the CURRENT SID only (see PRIOR-SID SCOPE).
  const matchFilter = patch.status === 'delivered'
    ? `provider_message_id.eq.${messageSid},prior_provider_message_ids.cs.{${messageSid}}`
    : `provider_message_id.eq.${messageSid}`;
  const { data, error } = await supabase
    .from('sms_outbound_obligations')
    .update(patch)
    .not('status', 'in', '(delivered,canceled)')
    .or(matchFilter)
    .select('id');

  const tableAbsent = Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205');
  const columnAbsent = Boolean(error) && error.code === 'PGRST204';
  const matched = (data?.length ?? 0) > 0;

  // A zero-row match with no error is expected (most status callbacks have no owed-state row
  // at all) and stays silent, matching this codebase's established idiom.
  if (error && !tableAbsent && !columnAbsent) {
    console.warn(`[owed-delivery-truth] applyOwedDeliveryTruth UPDATE failed for SID ${messageSid} (status=${status}, source=${source}, matched=${data?.length ?? 0}): ${error.message}`);
  }

  return {
    matched,
    updated: matched && !error,
    error: error && !tableAbsent && !columnAbsent ? error : null,
    tableAbsent,
    columnAbsent,
  };
}
