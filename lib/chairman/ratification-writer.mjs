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

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_TARGET_CONTRACTS = Object.freeze(['adam', 'coordinator', 'solomon', 'protocol']);
const DEFAULT_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * QF-20260901-107: fail-closed marker validation for the 'section_id' encoded_ref shape only. A
 * marker is a claim about content, written by the party whose work it certifies, and was never
 * checked against the content it claims to mark (the same defect class as unverified TESTING
 * evidence rows) -- 15 of 30 live rows carry ceremony prose ("Batch-encoded into section 601 ...")
 * that appears nowhere in the target file. Refuse to record a markerText that is not a literal
 * substring of the LIVE target_file content at mark time (convention: the clause header or first
 * sentence, never prose describing the encoding act itself). Fails OPEN (returns, does not throw)
 * only when the validation infrastructure itself is unavailable (no manifest, unknown section,
 * unreadable file) -- this is infra trouble, not a reason to block every future encode.
 * @param {{section_id:string}} ref
 * @param {string} markerText - already-trimmed
 * @param {{repoRoot?:string}} [opts]
 */
/**
 * Default staleness probe. Reuses computeDrift from scripts/check-claude-md-drift.cjs — the SAME
 * comparison CI and the pre-commit hook already use — so "stale" has ONE definition here rather
 * than a second one that can disagree with the first. Loaded lazily (and via the CJS default
 * export, since that module is CommonJS and this one is ESM) so importing this writer stays cheap.
 */
async function defaultDriftProbe(repoRoot) {
  const mod = await import('../../scripts/check-claude-md-drift.cjs');
  const computeDrift = (mod.default && mod.default.computeDrift) || mod.computeDrift;
  return computeDrift({ baseDir: repoRoot });
}

/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A (FR-4/FR-5). Verify a marker against the LIVE rendered
 * section, and REPORT what was actually checked.
 *
 * WHAT CHANGED AND WHY. QF-20260901-107 made this fail OPEN when the validation infrastructure is
 * unavailable (no manifest, unknown section, unreadable file), reasoning that infra trouble "is not
 * a reason to block every future encode". That reasoning is SOUND and is preserved here — turning
 * those into hard refusals would trade a silent-pass problem for a fleet-stopping one.
 *
 * The defect was never the fail-open; it was the SILENCE. The old code returned bare `undefined`,
 * so a mark VERIFIED against live content and a mark that SKIPPED verification were byte-identical
 * in the row: encoded_at, encoded_ref and marker_text look the same either way, and nothing
 * recorded which had happened. That is an assertion layer stating what it never measured. This now
 * returns a result the caller persists, so an unverified mark is countable instead of invisible.
 *
 * THE STALENESS GAP THIS ALSO CLOSES. The old check asked only whether the marker text appears in
 * the file. It never asked whether that FILE still matches the database, so a stale render whose
 * marker happens to survive passed silently. Staleness is a MEASURED mismatch, not missing infra,
 * so it REFUSES — the distinction this whole function now turns on is "could not check" versus
 * "checked and it is wrong".
 *
 * @returns {Promise<{verified:boolean, reason?:string, target_file?:string, checked_at:string}>}
 */
export async function verifyMarkerAgainstLiveSection(ref, markerText, { repoRoot = DEFAULT_REPO_ROOT, driftProbe = defaultDriftProbe } = {}) {
  const checked_at = new Date().toISOString();

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(repoRoot, 'claude-generation-manifest.json'), 'utf8'));
  } catch { return { verified: false, reason: 'no_manifest', checked_at }; }

  const meta = manifest.section_digests && manifest.section_digests.meta && manifest.section_digests.meta[ref.section_id];
  const targetFile = meta && meta.target_file;
  if (!targetFile) return { verified: false, reason: 'unknown_section', checked_at };

  // ORDER MATTERS, and getting it wrong is how this change first broke an existing test.
  //
  // The marker-presence check needs nothing but the file, while the staleness check needs the
  // database. Running the DB-dependent check FIRST meant that whenever the probe was unavailable,
  // the function returned early and NEVER REACHED the marker check — so an absent marker, a real
  // and always-detectable failure, was masked by unrelated infra trouble. A cheap always-available
  // check must never sit behind an expensive one that can be down.
  let liveContent;
  try {
    liveContent = readFileSync(join(repoRoot, targetFile), 'utf8');
  } catch { return { verified: false, reason: 'unreadable_file', target_file: targetFile, checked_at }; }

  if (!liveContent.includes(markerText)) {
    throw new Error(`markRatificationEncoded: markerText is not present in the live content of section ${ref.section_id} (${targetFile}) — refuse to record a marker that does not mark anything. First 80 chars: ${JSON.stringify(markerText.slice(0, 80))}`);
  }

  // The marker is present. Now ask the question the old check never asked: is the file it was
  // found in still current? A marker surviving in a STALE render is worse than one that is absent,
  // because it reads as confirmation of content the database no longer contains.
  let drift;
  try {
    drift = await driftProbe(repoRoot);
  } catch {
    // Probe unavailable is infra trouble, same class as a missing manifest: report, do not block.
    // The marker itself WAS verified above, so this is partial verification, not none.
    return { verified: true, stale_checked: false, reason: 'drift_probe_unavailable', target_file: targetFile, checked_at };
  }
  if (drift && Array.isArray(drift.staleFiles) && drift.staleFiles.includes(targetFile)) {
    throw new Error(`markRatificationEncoded: refusing to mark section ${ref.section_id} encoded — its rendered contract ${targetFile} is STALE against leo_protocol_sections. A marker found in a stale render certifies content the database no longer contains. Regenerate (node scripts/generate-claude-md-from-db.js) and re-run.`);
  }

  return { verified: true, stale_checked: true, target_file: targetFile, checked_at };
}

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
// SECURITY finding (evidence 9d1bacee, SEC-1): a prototype-bearing object literal indexed by an
// attacker-influenced string (ref.type comes from JSONB a DB row supplies) lets `constructor` /
// `toString` / `valueOf` / `hasOwnProperty` resolve to Object.prototype members instead of
// undefined — `ENCODED_REF_SHAPES['toString']` returned a truthy function, silently validating a
// forged ref. Object.create(null) has no prototype chain, so any non-own key is genuinely
// undefined; no hasOwnProperty guard needed at the call site as a result.
const ENCODED_REF_SHAPES = Object.freeze(Object.assign(Object.create(null), {
  section_id: (ref) => typeof ref.section_id === 'string' && ref.section_id.length > 0 && typeof ref.manifest_hash === 'string' && ref.manifest_hash.length > 0,
  sd_row: (ref) => typeof ref.sd_key === 'string' && ref.sd_key.length > 0,
  venture_metadata: (ref) => typeof ref.venture_id === 'string' && ref.venture_id.length > 0 && typeof ref.path === 'string' && ref.path.length > 0,
  memory_marker: (ref) => typeof ref.memory_id === 'string' && ref.memory_id.length > 0 && typeof ref.anchor === 'string' && ref.anchor.length > 0,
}));

/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B (TESTING finding, evidence 21dc1450): every LIVE
 * encoded chairman_ratifications row predates FR-3 and stores encoded_ref as a bare
 * {section_id, manifest_hash} with NO `type` key at all. Without this fallback,
 * validateEncodedRefShape/the target-read verifier would fail-closed on 100% of existing rows —
 * reading legacy data as fabricated is wrong, not merely stricter. A ref with a section_id key and
 * no type is treated as the implicit 'section_id' shape; a ref that already declares `type` is
 * never overridden.
 * @param {object} ref
 * @returns {object} ref, or a shallow copy with type:'section_id' filled in
 */
export function normalizeEncodedRef(ref) {
  if (ref && typeof ref === 'object' && !ref.type && Object.prototype.hasOwnProperty.call(ref, 'section_id')) {
    return { type: 'section_id', ...ref };
  }
  return ref;
}

/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B (FR-1/FR-3): validates a fully-formed encoded_ref
 * object against its declared `type` and that shape's required-field TYPES (not merely truthiness —
 * the live bug this SD fixes is exactly a truthy-but-wrong-typed section_id slipping through).
 * Applies normalizeEncodedRef first so legacy (typeless) section_id rows are recognized.
 * @param {{type:string}} ref
 * @returns {{valid:boolean, reason?:string}}
 */
export function validateEncodedRefShape(ref) {
  if (!ref || typeof ref !== 'object') return { valid: false, reason: 'encoded_ref must be an object' };
  const normalized = normalizeEncodedRef(ref);
  const hasShape = typeof normalized.type === 'string' && Object.prototype.hasOwnProperty.call(ENCODED_REF_SHAPES, normalized.type);
  const validator = hasShape ? ENCODED_REF_SHAPES[normalized.type] : undefined;
  if (typeof validator !== 'function') return { valid: false, reason: `unknown encoded_ref.type ${JSON.stringify(normalized.type)} — must be one of ${JSON.stringify(Object.keys(ENCODED_REF_SHAPES))}` };
  if (!validator(normalized)) return { valid: false, reason: `encoded_ref fields for type ${normalized.type} are missing or wrong-typed` };
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
export async function markRatificationEncoded(supabase, ratificationId, { sectionId, manifestHash, encodedRef, markerText, repoRoot, driftProbe } = {}) {
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

  const normalizedRef = normalizeEncodedRef(ref);

  // FR-4/FR-5: record WHAT WAS ACTUALLY CHECKED, not just that a mark happened. Only the
  // section_id shape has live rendered content to verify against; the other three pinned shapes
  // (sd_row, venture_metadata, memory_marker) have no rendered file, so they are recorded as
  // not-applicable rather than silently counted as verified.
  const markerVerification = normalizedRef.type === 'section_id'
    ? await verifyMarkerAgainstLiveSection(
      normalizedRef,
      trimmedMarker,
      { ...(repoRoot ? { repoRoot } : {}), ...(driftProbe ? { driftProbe } : {}) }
    )
    : { verified: false, reason: 'not_applicable_for_ref_type', checked_at: new Date().toISOString() };

  // DELIBERATELY NOT PERSISTED, and this is the honest limit of this change.
  //
  // Making an unverified mark countable needs its own column. chairman_ratifications has exactly
  // nine (id, ratified_at, quote, source, target_contracts, scribe_seat, encoded_at, encoded_ref,
  // marker_text) — no metadata jsonb — and its migrations are chairman-gated, as the
  // schema-lint-disable-line below records.
  //
  // The tempting shortcut is to fold this into encoded_ref, the one jsonb in reach. Rejected on
  // two counts: encoded_ref means WHAT WAS ENCODED AND WHERE, not how it was checked, so
  // overloading it makes the field mean two things; and Child B owns encoded_ref (resolving it at
  // the manifest hash), so writing a sibling key into it would collide with work already assigned
  // elsewhere. Smuggling a fact into the nearest available field because the right one needs
  // authorization is exactly the move this workstream exists to stop.
  //
  // So the verification result is RETURNED to the caller and surfaced in the log, and the durable
  // half is escalated for a chairman-gated migration. Until that lands, an unverified mark is at
  // least loud at the moment it happens instead of silently indistinguishable afterwards.
  if (!markerVerification.verified && markerVerification.reason !== 'not_applicable_for_ref_type') {
    console.warn(`MARKER_UNVERIFIED (${markerVerification.reason}): ratification ${ratificationId} is being marked encoded WITHOUT its marker having been checked against live content. This is recorded in the return value only — chairman_ratifications has no column for it yet.`);
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
  return { affected: rows.length, row: rows[0] || null, marker_verification: markerVerification };
}

export { VALID_TARGET_CONTRACTS, ENCODED_REF_SHAPES };

