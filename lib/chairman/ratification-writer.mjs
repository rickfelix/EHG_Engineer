/**
 * lib/chairman/ratification-writer.mjs — the single sanctioned write path for
 * chairman_ratifications. SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-2.
 *
 * Two-layer build+insert shape (buildXPayload + insertX), mirroring
 * lib/coordinator/dispatch.cjs's insertCoordinationRow + scripts/worker-signal.cjs's
 * buildXPayload functions. Fails closed on malformed input rather than silently
 * inserting a dead row.
 *
 * ratified_at is DB-clock-only for LIVE captures: recordChairmanRatification never
 * accepts a caller-supplied ratified_at. recordHistoricalRatification is a SEPARATE,
 * narrowly-scoped function used ONLY by the FR-5 one-off backfill script, which
 * requires an explicit historical ratifiedAt so seeded specimens carry their true
 * dates rather than being falsely backdated to "today" (see the migration's header
 * comment for the full rationale — PLAN-phase TESTING finding B2).
 */

const VALID_TARGET_CONTRACTS = Object.freeze(['adam', 'coordinator', 'solomon', 'protocol']);

/**
 * @param {{quote:string, source:string, targetContracts:string[], scribeSeat:string}} input
 * @returns {{quote:string, source:string, target_contracts:string[], scribe_seat:string}}
 */
export function buildRatificationPayload({ quote, source, targetContracts, scribeSeat } = {}) {
  const trimmedQuote = typeof quote === 'string' ? quote.trim() : '';
  if (!trimmedQuote) {
    throw new Error('buildRatificationPayload: quote is required and must be non-empty');
  }

  const trimmedSource = typeof source === 'string' ? source.trim() : '';
  if (trimmedSource.length < 5) {
    throw new Error('buildRatificationPayload: source is required (e.g. "terminal:<ref>", "sms:<row-id>", "email:<message-id>")');
  }

  if (!Array.isArray(targetContracts) || targetContracts.length === 0) {
    throw new Error('buildRatificationPayload: targetContracts must be a non-empty array');
  }
  const invalid = targetContracts.filter((c) => !VALID_TARGET_CONTRACTS.includes(c));
  if (invalid.length > 0) {
    throw new Error(`buildRatificationPayload: invalid target_contracts value(s) ${JSON.stringify(invalid)} — must be a subset of ${JSON.stringify(VALID_TARGET_CONTRACTS)}`);
  }

  const trimmedScribeSeat = typeof scribeSeat === 'string' ? scribeSeat.trim() : '';
  if (!trimmedScribeSeat) {
    throw new Error('buildRatificationPayload: scribeSeat is required and must be non-empty');
  }

  return {
    quote: trimmedQuote,
    source: trimmedSource,
    target_contracts: targetContracts,
    scribe_seat: trimmedScribeSeat,
  };
}

/**
 * LIVE capture path. Always DB-clock (never accepts ratified_at) — this is the only function
 * role-seat capture code may call.
 * @param {object} supabase - injected Supabase client
 * @param {{quote:string, source:string, targetContracts:string[], scribeSeat:string}} input
 * @returns {Promise<object>} the inserted row
 */
export async function recordChairmanRatification(supabase, input) {
  const payload = buildRatificationPayload(input);
  const { data, error } = await supabase
    .from('chairman_ratifications')
    .insert(payload)
    .select()
    .single();
  if (error) {
    throw new Error(`recordChairmanRatification: insert failed — ${error.message}`);
  }
  return data;
}

/**
 * BACKFILL-ONLY path (FR-5). Requires an explicit historical ratifiedAt — never imported by any
 * live quiet-tick or role-seat capture code, only by scripts/one-off/backfill-chairman-ratifications-*.mjs.
 * @param {object} supabase - injected Supabase client
 * @param {{quote:string, source:string, targetContracts:string[], scribeSeat:string}} input
 * @param {string|Date} ratifiedAt - REQUIRED true historical timestamp
 * @returns {Promise<object>} the inserted row
 */
export async function recordHistoricalRatification(supabase, input, ratifiedAt) {
  if (!ratifiedAt) {
    throw new Error('recordHistoricalRatification: ratifiedAt is required — there is no implicit now() fallback for the historical backfill path');
  }
  const payload = buildRatificationPayload(input);
  const { data, error } = await supabase
    .from('chairman_ratifications')
    .insert({ ...payload, ratified_at: new Date(ratifiedAt).toISOString() })
    .select()
    .single();
  if (error) {
    throw new Error(`recordHistoricalRatification: insert failed — ${error.message}`);
  }
  return data;
}

/**
 * The single sanctioned encoding transition. A no-op (0 rows affected, no error) when the row
 * already has encoded_at set — prevents a second scribe from re-triggering encoding.
 * @param {object} supabase - injected Supabase client
 * @param {string} ratificationId
 * @param {{sectionId:string, manifestHash:string, markerText:string}} encoding
 * @returns {Promise<{affected:number, row:object|null}>}
 */
export async function markRatificationEncoded(supabase, ratificationId, { sectionId, manifestHash, markerText } = {}) {
  if (!ratificationId) {
    throw new Error('markRatificationEncoded: ratificationId is required');
  }
  const trimmedMarker = typeof markerText === 'string' ? markerText.trim() : '';
  if (!sectionId || !manifestHash || !trimmedMarker) {
    throw new Error('markRatificationEncoded: sectionId, manifestHash, and a non-empty markerText are all required');
  }

  const { data, error } = await supabase
    .from('chairman_ratifications')
    .update({
      encoded_at: new Date().toISOString(),
      encoded_ref: { section_id: sectionId, manifest_hash: manifestHash },
      marker_text: trimmedMarker,
    })
    .eq('id', ratificationId)
    .is('encoded_at', null)
    .select();

  if (error) {
    throw new Error(`markRatificationEncoded: update failed — ${error.message}`);
  }
  const rows = data || [];
  return { affected: rows.length, row: rows[0] || null };
}

export { VALID_TARGET_CONTRACTS };
