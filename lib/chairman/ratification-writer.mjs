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
    .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, not yet applied
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
    .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, not yet applied
    .insert({ ...payload, ratified_at: new Date(ratifiedAt).toISOString() })
    .select()
    .single();
  if (error) {
    throw new Error(`recordHistoricalRatification: insert failed — ${error.message}`);
  }
  return data;
}

/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B (FR-3): the 4 encoded_ref shapes markRatificationEncoded
 * accepts, VALIDATION-pinned (not open-ended). 'section_id' is the original shape (now explicitly
 * typed); the other 3 widen encoded_ref beyond section-id-only encodings.
 */
const ENCODED_REF_SHAPES = Object.freeze({
  section_id: (ref) => typeof ref.section_id === 'string' && ref.section_id.length > 0 && typeof ref.manifest_hash === 'string' && ref.manifest_hash.length > 0,
  sd_row: (ref) => typeof ref.sd_key === 'string' && ref.sd_key.length > 0,
  venture_metadata: (ref) => typeof ref.venture_id === 'string' && ref.venture_id.length > 0 && typeof ref.path === 'string' && ref.path.length > 0,
  memory_marker: (ref) => typeof ref.memory_id === 'string' && ref.memory_id.length > 0 && typeof ref.anchor === 'string' && ref.anchor.length > 0,
});

/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B (FR-1/FR-3): validates a fully-formed encoded_ref
 * object against its declared `type` and that shape's required-field TYPES (not merely truthiness —
 * the live bug this SD fixes is exactly a truthy-but-wrong-typed section_id slipping through).
 * @param {{type:string}} ref
 * @returns {{valid:boolean, reason?:string}}
 */
export function validateEncodedRefShape(ref) {
  if (!ref || typeof ref !== 'object') return { valid: false, reason: 'encoded_ref must be an object' };
  const validator = ENCODED_REF_SHAPES[ref.type];
  if (!validator) return { valid: false, reason: `unknown encoded_ref.type ${JSON.stringify(ref.type)} — must be one of ${JSON.stringify(Object.keys(ENCODED_REF_SHAPES))}` };
  if (!validator(ref)) return { valid: false, reason: `encoded_ref fields for type ${ref.type} are missing or wrong-typed` };
  return { valid: true };
}

/**
 * The single sanctioned encoding transition. A no-op (0 rows affected, no error) when the row
 * already has encoded_at set — prevents a second scribe from re-triggering encoding.
 *
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B: two calling conventions. The legacy
 * {sectionId, manifestHash, markerText} shape is now TYPE-validated (typeof sectionId === 'string',
 * not just truthy) rather than accepted as-is — this is the FR-1 fix for the live bug where a
 * numeric sectionId slipped past the old truthiness-only guard. A caller may instead pass a
 * pre-built {encodedRef, markerText} for one of FR-3's 3 additional pinned shapes (sd_row,
 * venture_metadata, memory_marker).
 * @param {object} supabase - injected Supabase client
 * @param {string} ratificationId
 * @param {{sectionId?:string, manifestHash?:string, encodedRef?:object, markerText:string}} encoding
 * @returns {Promise<{affected:number, row:object|null}>}
 */
export async function markRatificationEncoded(supabase, ratificationId, { sectionId, manifestHash, encodedRef, markerText } = {}) {
  if (!ratificationId) {
    throw new Error('markRatificationEncoded: ratificationId is required');
  }
  const trimmedMarker = typeof markerText === 'string' ? markerText.trim() : '';
  if (!trimmedMarker) {
    throw new Error('markRatificationEncoded: a non-empty markerText is required');
  }

  let ref;
  if (encodedRef) {
    ref = encodedRef;
  } else {
    // Legacy call shape → the original section_id encoding, now type-checked (FR-1).
    if (typeof sectionId !== 'string' || sectionId.length === 0) {
      throw new Error(`markRatificationEncoded: sectionId must be a non-empty string, got ${typeof sectionId}`);
    }
    if (typeof manifestHash !== 'string' || manifestHash.length === 0) {
      throw new Error('markRatificationEncoded: manifestHash is required and must be a non-empty string');
    }
    ref = { type: 'section_id', section_id: sectionId, manifest_hash: manifestHash };
  }

  const { valid, reason } = validateEncodedRefShape(ref);
  if (!valid) {
    throw new Error(`markRatificationEncoded: invalid encoded_ref — ${reason}`);
  }

  const { data, error } = await supabase
    .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, not yet applied
    .update({
      encoded_at: new Date().toISOString(),
      encoded_ref: ref,
      marker_text: trimmedMarker,
    })
    .eq('id', ratificationId)
    .is('encoded_at', null)
    // .limit(1): id is the table's primary key, so this can never match more than one row —
    // explicit bound to satisfy count-truncation-diff-lint's provably-bounded requirement.
    .select()
    .limit(1);

  if (error) {
    throw new Error(`markRatificationEncoded: update failed — ${error.message}`);
  }
  const rows = data || [];
  return { affected: rows.length, row: rows[0] || null };
}

export { VALID_TARGET_CONTRACTS, ENCODED_REF_SHAPES };
