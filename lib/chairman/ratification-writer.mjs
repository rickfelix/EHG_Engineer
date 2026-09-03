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
// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B PR1 primitives: contract -> SET of rendered files, and a
// read pinned to an immutable source instead of the working tree.
import { resolveContractTargets } from './contract-target-resolver.mjs';
import { resolveEncodeCommit, readContractAtCommit, TIER } from './pinned-contract-read.mjs';

const VALID_TARGET_CONTRACTS = Object.freeze(['adam', 'coordinator', 'solomon', 'protocol']);
const DEFAULT_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * REMOVED by SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B PR2: assertMarkerPresentInLiveSection.
 *
 * It established the right invariant -- QF-20260901-107, "refuse to record a markerText that is
 * not a literal substring of the target content", after 15 of 30 live rows were found carrying
 * ceremony prose that appears nowhere in the target file -- and that invariant is PRESERVED and
 * WIDENED below, not dropped.
 *
 * Two properties made it unable to deliver that invariant in full, and both are fixed rather than
 * worked around: it checked exactly ONE file (a scalar manifest target_file) while a ruling may
 * name several contracts, and it read the WORKING TREE, so a lagging checkout could fail a valid
 * mark. Its three deliberate fail-open exits were sound reasoning for a working-tree read -- a
 * partial checkout is ordinary, and blocking every ceremony encode on it would have been worse
 * than the gap -- but that rationale does not survive the move to a pinned read, which is why the
 * replacement fails CLOSED with a named reason instead. No opt-out flag is provided: an escape
 * hatch back to the single-file check would keep the fail-open exits reachable.
 */

/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B), PR2 — multi-target, tree-independent
 * marker verification. Supersedes assertMarkerPresentInLiveSection for the section_id shape.
 *
 * WHAT WAS WRONG. The single-target function above resolves ONE file, from a scalar
 * manifest.section_digests.meta[section_id].target_file, and never reads row.target_contracts.
 * Measured 2026-09-03 over the live ledger: 49 encoded rows name 105 target-contract slots, 48
 * covered, 57 (54.3%) never verified, 34 of 49 rows short.
 *
 * ANSWERING THE ORIGINAL FAIL-OPEN RATIONALE, rather than silently overruling it. The docstring
 * above states the three `return`s are deliberate: "Fails OPEN ... only when the validation
 * infrastructure itself is unavailable (no manifest, unknown section, unreadable file) -- this is
 * infra trouble, not a reason to block every future encode." That reasoning was SOUND for a
 * working-tree read: a lagging or partial checkout is ordinary, and blocking every ceremony encode
 * on it would have been worse than the gap. It no longer holds here, because this path does not
 * read the working tree at all -- it reads at a pinned commit, or from leo_protocol_sections.
 * The fragility the fail-open was protecting against is the thing PR1 removed. What remains after
 * that removal is not infra trouble but a genuine inability to verify, and recording encoded_at
 * while unable to verify is the defect this child exists to close. So: fail CLOSED, with a named
 * reason a reader can act on.
 *
 * CARDINALITY (the open question VALIDATION flagged). A contract resolves to a SET of files --
 * adam is CLAUDE_ADAM.md + _MANUAL + _PROVENANCE -- but a ruling's clause is encoded into ONE
 * section, which renders into ONE of those companions. Requiring the marker in EVERY file of a
 * contract would fail every legitimate row. The correct predicate is therefore ANY-MEMBER-
 * SATISFIES per contract: each NAMED contract must have at least one of its files carrying the
 * marker, and a contract with none is a real miss. That is what "verified at each target" means.
 *
 * @param {object} supabase
 * @param {string} ratificationId
 * @param {{section_id:string, manifest_hash?:string}} ref - normalized encoded_ref
 * @param {string} markerText - already trimmed
 * @param {{repoRoot?:string}} [opts]
 */
/** Real implementations; overridable per-call so a test can supply content without standing up a
 *  git repo. Mirrors the `{ fetchers = DEFAULT_FETCHERS }` seam this module family already uses in
 *  ratification-target-read-verifier.mjs:117 rather than inventing a second injection style. */
const DEFAULT_VERIFY_DEPS = Object.freeze({ resolveEncodeCommit, readContractAtCommit, resolveContractTargets });

async function assertMarkerAtEveryTargetContract(supabase, ratificationId, ref, markerText, { repoRoot = DEFAULT_REPO_ROOT, deps = {} } = {}) {
  const _resolveEncodeCommit = deps.resolveEncodeCommit || DEFAULT_VERIFY_DEPS.resolveEncodeCommit;
  const _readContractAtCommit = deps.readContractAtCommit || DEFAULT_VERIFY_DEPS.readContractAtCommit;
  const _resolveContractTargets = deps.resolveContractTargets || DEFAULT_VERIFY_DEPS.resolveContractTargets;
  // The row carries target_contracts; markRatificationEncoded never read it before (it went
  // straight to a blind conditional UPDATE), which is why "verify at every target" was not
  // merely unimplemented but un-askable.
  const { data: row, error: readErr } = await supabase
    .from('chairman_ratifications') // schema-lint-disable-line — chairman-gated migration, not yet applied
    .select('target_contracts, encoded_at')
    .eq('id', ratificationId)
    .maybeSingle();

  if (readErr) {
    throw new Error(`markRatificationEncoded: could not read target_contracts for ${ratificationId} — ${readErr.message}. Refusing to record a marker that was never checked.`);
  }
  if (!row) {
    throw new Error(`markRatificationEncoded: ratification ${ratificationId} not found — refusing to record a marker against a row that does not exist.`);
  }
  const contracts = Array.isArray(row.target_contracts) ? row.target_contracts.filter(Boolean) : [];
  if (contracts.length === 0) {
    throw new Error(`markRatificationEncoded: ratification ${ratificationId} names no target_contracts — there is nothing to verify against, and recording encoded_at would assert a check that cannot exist.`);
  }

  const pin = await _resolveEncodeCommit({ encoded_ref: ref, encoded_at: row.encoded_at }, { repoRoot });

  // Read a rendered file from the immutable source this row pins to. Tier 3 (no commit at all)
  // cannot answer a FILE-level question -- leo_protocol_sections is section-scoped -- so it is a
  // named refusal rather than a silent pass.
  async function readTarget(relPath) {
    if (pin.tier === TIER.DB || !pin.commit) {
      throw new Error(`markRatificationEncoded: no commit pin is derivable for ratification ${ratificationId} (${pin.reason}), so the rendered file ${relPath} cannot be read from an immutable source. Refusing to record a marker that cannot be verified. Verify via leo_protocol_sections.content out-of-band, or repair encoded_ref.manifest_hash.`);
    }
    return _readContractAtCommit(pin.commit, relPath, { repoRoot });
  }

  // CROSS-TARGET CONSISTENCY. Live row 20dc072b declares target_contracts ['protocol'] but is
  // encoded against section 601 -> CLAUDE_ADAM.md, a file it does not name; the writer validated
  // there and stamped encoded_at, and the marker is absent from CLAUDE.md to this day. Nothing
  // compared the ref's own file against the row's declared contracts. This is also exactly why
  // the covered-slot count is 48 rather than 49.
  const manifestRaw = await readTarget('claude-generation-manifest.json');
  let sectionFile = null;
  try {
    const manifest = JSON.parse(manifestRaw);
    const meta = manifest.section_digests && manifest.section_digests.meta && manifest.section_digests.meta[ref.section_id];
    sectionFile = (meta && meta.target_file) || null;
  } catch (err) {
    throw new Error(`markRatificationEncoded: manifest at ${pin.commit} is unparseable (${err.message}) — refusing to record an unverified marker.`);
  }

  const declaredFiles = new Set();
  const byContract = new Map();
  for (const contract of contracts) {
    const files = _resolveContractTargets(contract, { repoRoot });
    byContract.set(contract, files);
    for (const f of files) declaredFiles.add(f);
  }

  if (sectionFile && !declaredFiles.has(sectionFile)) {
    throw new Error(`markRatificationEncoded: CROSS-TARGET INCONSISTENCY on ${ratificationId} — encoded_ref points at section ${ref.section_id}, which renders into ${sectionFile}, but the row declares target_contracts [${contracts.join(', ')}] covering [${[...declaredFiles].sort().join(', ')}]. The ruling would be marked encoded against a contract it does not name.`);
  }

  // ANY-MEMBER-SATISFIES per named contract (see cardinality note above).
  const missing = [];
  for (const [contract, files] of byContract) {
    let found = false;
    const unreadable = [];
    for (const relPath of files) {
      let content;
      try {
        content = await readTarget(relPath);
      } catch (err) {
        // A file absent at the pinned commit is a real answer ("the clause was not there"), not
        // infra trouble -- record it and let the per-contract verdict decide.
        unreadable.push(`${relPath} (${err.code || 'unreadable'})`);
        continue;
      }
      if (content.includes(markerText)) { found = true; break; }
    }
    if (!found) missing.push(`${contract} -> none of [${files.join(', ')}]${unreadable.length ? ` (unreadable: ${unreadable.join('; ')})` : ''}`);
  }

  if (missing.length > 0) {
    throw new Error(`markRatificationEncoded: markerText is absent from ${missing.length} of ${contracts.length} named target contract(s) on ${ratificationId} — refuse to record a marker that does not mark anything. Pin: ${pin.tier}${pin.approximate ? ' (APPROXIMATE)' : ''} @ ${pin.commit}. Missing: ${missing.join(' | ')}. First 80 chars of marker: ${JSON.stringify(markerText.slice(0, 80))}`);
  }

  return { verified_contracts: contracts, pin_tier: pin.tier, pin_commit: pin.commit, approximate: Boolean(pin.approximate) };
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
export async function markRatificationEncoded(supabase, ratificationId, { sectionId, manifestHash, encodedRef, markerText, repoRoot, deps } = {}) {
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
  if (normalizedRef.type === 'section_id') {
    // SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B PR2: verify at EVERY named target contract, read from
    // an immutable source. There is deliberately NO opt-out flag: an escape hatch back to the
    // single-file working-tree check would keep the three fail-open exits reachable, and "keep the
    // old path alive so the tests still pass" is how this defect class survives in the first place.
    await assertMarkerAtEveryTargetContract(
      supabase, ratificationId, normalizedRef, trimmedMarker,
      { ...(repoRoot ? { repoRoot } : {}), ...(deps ? { deps } : {}) },
    );
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

