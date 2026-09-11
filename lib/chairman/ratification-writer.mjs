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
import { createHash, randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B PR1 primitives: contract -> SET of rendered files, and a
// read pinned to an immutable source instead of the working tree.
import { resolveContractTargets } from './contract-target-resolver.mjs';
import { resolveEncodeCommit, readContractAtCommit } from './pinned-contract-read.mjs';
// SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3): the sanctioned write path for the new
// INSERT-only sibling table. Degrades gracefully when the chairman-gated migration is unapplied.
import { recordVerificationAttempt } from './ratification-verification-store.mjs';

// 'michael' joined under SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A: CLAUDE_MICHAEL*.md is a role
// contract, not part of the `protocol` residual (a ['protocol'] ratification must not be asserted
// against the Michael files). Mirrored by contract-target-resolver.mjs TARGET_CONTRACTS.
const VALID_TARGET_CONTRACTS = Object.freeze(['adam', 'coordinator', 'solomon', 'michael', 'protocol']);
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

/** Real implementations, overridable per-call so a test can supply content without standing up a
 *  git repo — the same seam shape as `driftProbe` above and as
 *  ratification-target-read-verifier.mjs:117's `{ fetchers = DEFAULT_FETCHERS }`. Shared by BOTH
 *  child A (below) and child B (verifyMarkerAcrossTargetContracts), which forwards its own `deps`
 *  option down into child A rather than resolving a second, potentially different pin
 *  (SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001, FR-1). */
const DEFAULT_TARGET_DEPS = Object.freeze({ resolveEncodeCommit, readContractAtCommit, resolveContractTargets });

/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A (FR-4/FR-5). Verify a marker against a rendered section,
 * and REPORT what was actually checked.
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
 * SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-1/FR-1a): the CONTENT read now PREFERS a
 * commit pinned via resolveEncodeCommit + readContractAtCommit (lib/chairman/pinned-contract-read.
 * mjs) over the working tree — a lagging checkout can no longer certify content it does not
 * actually contain. FR-1a is folded in here: the pin resolver is now passed `relPath` (this
 * section's own target_file) and `encoded_at` (now — for a fresh live encode, the row's own
 * encoded_at is still NULL), which the resolver requires to reach its tier-2 (approximate) pin;
 * omitting them (the pre-fix call shape) made tier 2 structurally unreachable, so every unpinned
 * row fell straight to tier 3 even when an approximate pin genuinely existed.
 *
 * The marker-presence check itself is NEVER skipped when no pin resolves or a pinned read fails —
 * it falls back to the working tree, exactly as before this SD. Pinning strengthens the EVIDENCE
 * (pin_tier / commit / content_verified_at_pin are reported alongside `verified`), it does not
 * replace the underlying detection this function exists for (QF-20260901-107). The manifest read
 * (which section maps to which file) stays on the working tree deliberately: resolving a pin
 * requires knowing target_file, which comes FROM the manifest, so pinning that read too would be
 * circular; the manifest is a structural mapping regenerated from the DB, not itself ratified
 * content.
 *
 * @returns {Promise<{verified:boolean, reason?:string, target_file?:string, checked_at:string,
 *   pin_tier?:string, commit?:string, approximate?:boolean, content_verified_at_pin?:boolean}>}
 */
export async function verifyMarkerAgainstLiveSection(ref, markerText, {
  repoRoot = DEFAULT_REPO_ROOT, driftProbe = defaultDriftProbe, deps = {},
} = {}) {
  const _resolveEncodeCommit = deps.resolveEncodeCommit || DEFAULT_TARGET_DEPS.resolveEncodeCommit;
  const _readContractAtCommit = deps.readContractAtCommit || DEFAULT_TARGET_DEPS.readContractAtCommit;
  const checked_at = new Date().toISOString();

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(repoRoot, 'claude-generation-manifest.json'), 'utf8'));
  } catch { return { verified: false, reason: 'no_manifest', checked_at }; }

  const meta = manifest.section_digests && manifest.section_digests.meta && manifest.section_digests.meta[ref.section_id];
  const targetFile = meta && meta.target_file;
  if (!targetFile) return { verified: false, reason: 'unknown_section', checked_at };

  // FR-1a: relPath + encoded_at('now') so tier 2 (approximate) is actually reachable, not just
  // tier 1. See pinned-contract-read.mjs:resolveEncodeCommit — both are required for tier 2.
  const pin = await _resolveEncodeCommit(
    { encoded_ref: ref, encoded_at: new Date().toISOString() },
    { repoRoot, relPath: targetFile }
  );

  // ORDER MATTERS, and getting it wrong is how a prior change first broke an existing test.
  //
  // The marker-presence check needs nothing but the file, while the staleness check needs the
  // database. Running the DB-dependent check FIRST meant that whenever the probe was unavailable,
  // the function returned early and NEVER REACHED the marker check — so an absent marker, a real
  // and always-detectable failure, was masked by unrelated infra trouble. A cheap always-available
  // check must never sit behind an expensive one that can be down.
  let liveContent;
  let contentVerifiedAtPin = false;
  if (pin.commit) {
    try {
      liveContent = await _readContractAtCommit(pin.commit, targetFile, { repoRoot });
      contentVerifiedAtPin = true;
    } catch { /* unreadable at the pin (shallow clone, pruned object) — fall back below */ }
  }
  if (liveContent === undefined) {
    try {
      liveContent = readFileSync(join(repoRoot, targetFile), 'utf8');
    } catch { return { verified: false, reason: 'unreadable_file', pin_tier: pin.tier, target_file: targetFile, checked_at }; }
  }

  if (!liveContent.includes(markerText)) {
    // Message wording preserved verbatim ("is not present in the live content") for the
    // working-tree (unpinned) case — pre-existing tests across three files assert this exact
    // phrase. When the read WAS pinned, the message instead names the pin (tier/commit), matching
    // the sibling multi-contract refusal message's own convention.
    const msg = contentVerifiedAtPin
      ? `markRatificationEncoded: markerText is not present in the content of section ${ref.section_id} (${targetFile}) at pin ${pin.tier}${pin.approximate ? ' (APPROXIMATE)' : ''} @ ${pin.commit} — refuse to record a marker that does not mark anything. First 80 chars: ${JSON.stringify(markerText.slice(0, 80))}`
      : `markRatificationEncoded: markerText is not present in the live content of section ${ref.section_id} (${targetFile}) — refuse to record a marker that does not mark anything. First 80 chars: ${JSON.stringify(markerText.slice(0, 80))}`;
    throw new Error(msg);
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
    return { verified: true, stale_checked: false, reason: 'drift_probe_unavailable', pin_tier: pin.tier, commit: pin.commit || undefined, approximate: Boolean(pin.approximate), content_verified_at_pin: contentVerifiedAtPin, target_file: targetFile, content: liveContent, checked_at };
  }
  if (drift && Array.isArray(drift.staleFiles) && drift.staleFiles.includes(targetFile)) {
    throw new Error(`markRatificationEncoded: refusing to mark section ${ref.section_id} encoded — its rendered contract ${targetFile} is STALE against leo_protocol_sections. A marker found in a stale render certifies content the database no longer contains. Regenerate (node scripts/generate-claude-md-from-db.js) and re-run.`);
  }

  return { verified: true, stale_checked: true, pin_tier: pin.tier, commit: pin.commit || undefined, approximate: Boolean(pin.approximate), content_verified_at_pin: contentVerifiedAtPin, target_file: targetFile, content: liveContent, checked_at };
}

/**
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-B (W2 child B): verify the marker at EVERY contract the
 * ruling NAMES, not just the one file its section renders into, and read from an immutable source
 * so a lagging checkout cannot fail a valid mark.
 *
 * THIS IS A LAYER OVER verifyMarkerAgainstLiveSection, NOT A REPLACEMENT. That function's return
 * contract is the contract; child A established it and it is the better interface. Everything it
 * reports, it still reports; everything it refuses, it still refuses. This adds the fields
 * verified_contracts, pin_tier, approximate and multi_target_checked on top.
 *
 * THE DEFECT IT CLOSES, measured over the live ledger 2026-09-03: the single-file check resolves
 * ONE file from a scalar manifest target_file and never reads row.target_contracts. 49 encoded rows
 * name 105 target-contract slots; 48 covered, 57 (54.3%) never verified, 34 of 49 rows short. Row
 * 20dc072b declares ['protocol'] but is encoded against section 601 -> CLAUDE_ADAM.md, a file it
 * does not name — validated there and stamped anyway, and that one row is why the covered count is
 * 48 rather than 49.
 *
 * REPORT VERSUS REFUSE — the distinction child A drew, and the one this obeys.
 *   "Could not check"  -> REPORT {verified:false|true, reason}. Infrastructure being unavailable is
 *                         not the caller's fault, and closing that path trades a silent-pass
 *                         problem for a fleet-stopping one. Preserved from QF-20260901-107.
 *   "Checked and wrong" -> THROW. A named contract with no file carrying the marker, or an
 *                         encoded_ref pointing outside the contracts the row declares, is a
 *                         measured disagreement.
 * An earlier draft of this layer failed CLOSED when no commit pin was derivable. That was wrong:
 * an underivable pin is missing infrastructure, not a disagreement, and it affects 20 of 49 live
 * rows whose manifest_hash is not a git object. It now reports.
 *
 * CARDINALITY: a contract resolves to a SET (adam is base + _MANUAL + _PROVENANCE) but a ruling's
 * clause renders into ONE companion, so the predicate is ANY-MEMBER-SATISFIES per NAMED contract.
 * Requiring the marker in every file of a contract would fail every legitimate row.
 *
 * @returns {Promise<object>} child A's result object, extended
 */
export async function verifyMarkerAcrossTargetContracts(supabase, ratificationId, ref, markerText, {
  repoRoot = DEFAULT_REPO_ROOT, driftProbe = defaultDriftProbe, deps = {},
} = {}) {
  const _readContractAtCommit = deps.readContractAtCommit || DEFAULT_TARGET_DEPS.readContractAtCommit;
  const _resolveContractTargets = deps.resolveContractTargets || DEFAULT_TARGET_DEPS.resolveContractTargets;

  // Child A's check runs FIRST: it throws on an absent marker or a stale render, and reports when
  // infrastructure is unavailable. If it could not verify, there is nothing for this layer to
  // widen — return its verdict untouched rather than second-guessing it.
  //
  // Only `resolveEncodeCommit` is forwarded down (FR-1a: an injected pin-tier mock governs both
  // layers, and the pin is resolved exactly ONCE — child A now owns pin resolution; this layer
  // reuses base.commit/base.pin_tier rather than calling resolveEncodeCommit a second time).
  // `readContractAtCommit` is DELIBERATELY NOT forwarded: child A's own read is about the ONE file
  // its OWN section renders into, decoupled from this layer's per-CONTRACT `files` fixture (which
  // may legitimately omit or mismatch that file — e.g. a marker carried only by a companion file,
  // not the base contract file). Child A always uses the real pinned-then-working-tree-fallback
  // read for its own file; a test asserting child A's OWN pinned-read behavior injects deps
  // directly when calling verifyMarkerAgainstLiveSection, not through this layer.
  const base = await verifyMarkerAgainstLiveSection(ref, markerText, {
    repoRoot, driftProbe, deps: deps.resolveEncodeCommit ? { resolveEncodeCommit: deps.resolveEncodeCommit } : {},
  });
  if (!base.verified) return { ...base, multi_target_checked: false };

  const { data: row, error: readErr } = await supabase
    .from('chairman_ratifications')
    .select('target_contracts')
    .eq('id', ratificationId)
    .maybeSingle();

  // Row-read trouble is infrastructure, not disagreement.
  if (readErr) return { ...base, multi_target_checked: false, reason: 'target_contracts_unreadable' };
  if (!row) return { ...base, multi_target_checked: false, reason: 'ratification_row_not_found' };

  const contracts = Array.isArray(row.target_contracts) ? row.target_contracts.filter(Boolean) : [];
  if (contracts.length === 0) return { ...base, multi_target_checked: false, reason: 'no_target_contracts' };

  // Missing infrastructure, same as child A's own no-pin report.
  if (!base.commit) {
    return { ...base, multi_target_checked: false, reason: 'no_commit_pin', pin_tier: base.pin_tier };
  }
  const pin = { commit: base.commit, tier: base.pin_tier, approximate: base.approximate };

  let declaredFiles;
  try {
    declaredFiles = new Map(contracts.map((c) => [c, _resolveContractTargets(c, { repoRoot })]));
  } catch (err) {
    // An unmappable contract name is a resolver gap, not a marker disagreement.
    return { ...base, multi_target_checked: false, reason: `contract_unresolvable: ${err.message}` };
  }

  // CROSS-TARGET CONSISTENCY — checked and wrong, so it refuses. base.target_file is the file the
  // ref's section actually renders into; if the row does not name a contract covering it, the
  // ruling would be marked encoded against a contract it never claimed.
  const allFiles = new Set([...declaredFiles.values()].flat());
  if (base.target_file && !allFiles.has(base.target_file)) {
    throw new Error(`markRatificationEncoded: CROSS-TARGET INCONSISTENCY on ${ratificationId} — encoded_ref points at section ${ref.section_id}, which renders into ${base.target_file}, but the row declares target_contracts [${contracts.join(', ')}] covering [${[...allFiles].sort().join(', ')}]. Refusing to mark a ruling encoded against a contract it does not name.`);
  }

  const missing = [];
  let unreadableAll = true;
  for (const [contract, files] of declaredFiles) {
    let found = false;
    let readAny = false;
    for (const relPath of files) {
      let content;
      try {
        content = await _readContractAtCommit(pin.commit, relPath, { repoRoot });
      } catch { continue; } // absent at this commit — try the contract's other companions
      readAny = true;
      if (content.includes(markerText)) { found = true; break; }
    }
    if (readAny) unreadableAll = false;
    if (readAny && !found) missing.push(`${contract} -> none of [${files.join(', ')}]`);
  }

  // Nothing readable at the pin at all is infrastructure (a shallow clone, a pruned object), so it
  // reports. A contract whose files WERE read and lack the marker is a disagreement, so it refuses.
  if (unreadableAll) {
    return { ...base, multi_target_checked: false, reason: 'no_targets_readable_at_pin', pin_tier: pin.tier };
  }
  if (missing.length > 0) {
    throw new Error(`markRatificationEncoded: markerText is absent from ${missing.length} of ${contracts.length} named target contract(s) on ${ratificationId} — refuse to record a marker that does not mark anything. Pin: ${pin.tier}${pin.approximate ? ' (APPROXIMATE)' : ''} @ ${pin.commit}. Missing: ${missing.join(' | ')}. First 80 chars of marker: ${JSON.stringify(markerText.slice(0, 80))}`);
  }

  return {
    ...base,
    multi_target_checked: true,
    verified_contracts: contracts,
    pin_tier: pin.tier,
    approximate: Boolean(pin.approximate),
  };
}

/**
 * @param {{quote:string, source:string, targetContracts:string[], scribeSeat:string, utteredAt:string|Date, transcriptRef:string}} input
 * @returns {{quote:string, source:string, target_contracts:string[], scribe_seat:string, uttered_at:string, quote_hash:string, transcript_ref:string}}
 */
export function buildRatificationPayload({ quote, source, targetContracts, scribeSeat, utteredAt, transcriptRef } = {}) {
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

  // SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D: uttered_at and transcript_ref are genuine
  // external captures (when the chairman actually spoke, and where the utterance can be
  // found again) — neither is derivable from anything else the caller supplies, so both
  // get the same named-rejection treatment as the four fields above.
  const utteredAtDate = utteredAt instanceof Date ? utteredAt : (typeof utteredAt === 'string' && utteredAt ? new Date(utteredAt) : null);
  if (!utteredAtDate || Number.isNaN(utteredAtDate.getTime())) {
    throw new Error('buildRatificationPayload: utteredAt is required and must be a valid Date or ISO timestamp string (the moment the chairman spoke, distinct from DB capture time)');
  }

  const trimmedTranscriptRef = typeof transcriptRef === 'string' ? transcriptRef.trim() : '';
  if (!trimmedTranscriptRef) {
    throw new Error('buildRatificationPayload: transcriptRef is required and must be non-empty (a pointer back to the source utterance: session_coordination row id, SMS row id, or terminal seat id)');
  }

  // quote_hash is COMPUTED here, never caller-supplied: the field exists so tampering with
  // a stored quote is detectable, which a caller-suppliable hash would defeat outright — a
  // tampering caller could simply supply a hash of the tampered text.
  const quoteHash = createHash('sha256').update(trimmedQuote, 'utf8').digest('hex');

  return {
    quote: trimmedQuote,
    source: trimmedSource,
    target_contracts: targetContracts,
    scribe_seat: trimmedScribeSeat,
    uttered_at: utteredAtDate.toISOString(),
    quote_hash: quoteHash,
    transcript_ref: trimmedTranscriptRef,
  };
}

/**
 * LIVE capture path. Always DB-clock (never accepts ratified_at) — this is the only function
 * role-seat capture code may call.
 * @param {object} supabase - injected Supabase client
 * @param {{quote:string, source:string, targetContracts:string[], scribeSeat:string, utteredAt:string|Date, transcriptRef:string}} input
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
 * @param {{quote:string, source:string, targetContracts:string[], scribeSeat:string, utteredAt:string|Date, transcriptRef:string}} input
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
export async function markRatificationEncoded(supabase, ratificationId, { sectionId, manifestHash, encodedRef, markerText, repoRoot, driftProbe, deps } = {}) {
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
  const runId = randomUUID();
  const PRODUCER = 'lib/chairman/ratification-writer.mjs:markRatificationEncoded';

  // FR-4/FR-5 (CAPA-CONTRACT-TRUTH-001-A/B): record WHAT WAS ACTUALLY CHECKED, not just that a
  // mark happened. Only the section_id shape has live rendered content to verify against; the
  // other three pinned shapes (sd_row, venture_metadata, memory_marker) have no rendered file, so
  // they are recorded as not-applicable rather than silently counted as verified.
  // Child B layers multi-target resolution and the pinned read OVER child A's check, which runs
  // first inside it. Child A's return contract is preserved and extended, never replaced
  // (coordinator ruling: take the landed shape as the base, layer on top).
  let markerVerification;
  try {
    markerVerification = normalizedRef.type === 'section_id'
      ? await verifyMarkerAcrossTargetContracts(
        supabase,
        ratificationId,
        normalizedRef,
        trimmedMarker,
        { ...(repoRoot ? { repoRoot } : {}), ...(driftProbe ? { driftProbe } : {}), ...(deps ? { deps } : {}) }
      )
      : { verified: false, reason: 'not_applicable_for_ref_type', checked_at: new Date().toISOString() };
  } catch (err) {
    // SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3): "checked and wrong" (absent
    // marker, stale render, cross-target inconsistency, measured multi-contract disagreement)
    // still throws exactly as before — that doctrine is untouched. What's new is that the attempt
    // is recorded before the throw propagates, so a refused mark is not lost the way an
    // unpersisted console.warn used to lose an unverified one. Never swallows the throw.
    await recordVerificationAttempt(supabase, {
      targetRatificationId: ratificationId, attemptKind: 'live_encode', outcome: 'marker_absent',
      encodedAtPersisted: false, attemptedEncodedRef: ref, attemptedMarkerText: trimmedMarker,
      reason: String((err && err.message) || err).slice(0, 500), producer: PRODUCER, runId,
      detail: { thrown: true },
    });
    throw err;
  }

  // DELIBERATELY NOT PERSISTED ON THE PARENT ROW, and this is the honest limit of that change.
  //
  // Making an unverified mark countable needs its own column. chairman_ratifications has no
  // metadata jsonb (id, ratified_at, quote, source, target_contracts, scribe_seat, encoded_at,
  // encoded_ref, marker_text, plus uttered_at/quote_hash/transcript_ref from
  // SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D), and its migrations are chairman-gated.
  //
  // The tempting shortcut is to fold this into encoded_ref, the one jsonb in reach. Rejected on
  // two counts: encoded_ref means WHAT WAS ENCODED AND WHERE, not how it was checked, so
  // overloading it makes the field mean two things; and Child B owns encoded_ref (resolving it at
  // the manifest hash), so writing a sibling key into it would collide with work already assigned
  // elsewhere. Smuggling a fact into the nearest available field because the right one needs
  // authorization is exactly the move this workstream exists to stop.
  //
  // SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3) is the actual fix: the verdict is now
  // ALSO persisted to the new INSERT-only chairman_ratification_verifications sibling table
  // (degrading gracefully until the chairman applies its migration), so an unverified mark is
  // durably countable, not merely loud in a log line.
  if (!markerVerification.verified && markerVerification.reason !== 'not_applicable_for_ref_type') {
    console.warn(`MARKER_UNVERIFIED (${markerVerification.reason}): ratification ${ratificationId} is being marked encoded WITHOUT its marker having been checked against live content. This is recorded in the return value and the verification-verdict table.`);
  }

  // SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-2): refuse to persist encoded_at ONLY on
  // the specific outcome this SD's scope names — no_commit_pin — never a throw (a structured
  // return value; throwing on no_commit_pin was already tried, found wrong, and reverted — see
  // verifyMarkerAcrossTargetContracts's docblock). Discriminated on the exact reason token, never
  // on the generic `verified` flag: no_commit_pin deliberately reports verified:true under the
  // coordinator-ratified report-not-throw doctrine (lib/chairman/__tests__/
  // ratification-multi-target-verification.test.js:109-117), so a `!verified` predicate would
  // silently never fire for the one case this FR exists to catch — the same keyword-detector
  // blind spot found on SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001.
  //
  // DELIBERATELY NOT WIDENED to every other "could not check" outcome (row unreadable, no target
  // contracts, contract unresolvable, nothing readable at the pin, no manifest, unknown section,
  // drift-probe-down) — those all continue to proceed exactly as before this SD. That is
  // deliberate, ratified doctrine (QF-20260901-107 / CAPA-CONTRACT-TRUTH-001-A/B) this SD does not
  // reopen; widening the refusal to them would be scope creep beyond what was asked, confirmed
  // live against the existing test suite (12 pre-existing tests assert the encode proceeds on
  // exactly these outcomes).
  const isSectionId = normalizedRef.type === 'section_id';
  const refusalReason = (isSectionId && markerVerification.reason === 'no_commit_pin') ? 'no_commit_pin' : null;

  if (refusalReason) {
    await recordVerificationAttempt(supabase, {
      targetRatificationId: ratificationId, attemptKind: 'live_encode', outcome: 'no_commit_pin',
      encodedAtPersisted: false,
      pinTier: markerVerification.pin_tier || null, commitSha: null,
      targetFile: markerVerification.target_file || null,
      attemptedEncodedRef: ref, attemptedMarkerText: trimmedMarker,
      reason: refusalReason, producer: PRODUCER, runId, detail: markerVerification,
    });
    return { affected: 0, row: null, marker_verification: markerVerification, refused: refusalReason, provenance_derived: [] };
  }

  // SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D FR-3 (the root fix, not a workaround): a mark IS an
  // UPDATE, and 20260903_chairman_ratifications_utterance_provenance.sql's CHECK ... NOT VALID
  // only skips validation of existing rows UNTIL they are next updated — so a legacy row with
  // NULL uttered_at/quote_hash/transcript_ref trips cr_utterance_provenance_present the instant
  // this function tries to mark it, exactly the regression measured live 2026-09-04 on rows
  // ffebbd68/544bf078/31c75f74. Scope line adopted from Solomon (row b8e5ec57): never write a
  // sentinel to satisfy the constraint (evidence without provenance, graded ABSENT under
  // 6c263823) — legacy rows already carry the real material (full quote, ratified_at, source),
  // so DERIVE the three fields from what the row already has, stamped as derived rather than
  // captured: quote_hash = sha256(quote); uttered_at = ratified_at (labelled inherited, since
  // the true utterance moment was never captured for these rows); transcript_ref = source plus
  // the encoded_ref now being written (this composite is what marks it DERIVED — a genuinely
  // captured transcript_ref, written at insert time by recordChairmanRatification, never has an
  // encoded_ref to include, since encoding always happens later).
  const provenanceUpdate = {};
  const { data: provenanceRow, error: provenanceErr } = await supabase
    .from('chairman_ratifications')
    .select('quote, source, ratified_at, uttered_at, quote_hash, transcript_ref')
    .eq('id', ratificationId)
    .maybeSingle();
  // Row-read trouble or an absent row is infrastructure, not a reason to refuse the mark itself
  // — the update below still runs, and a genuinely NULL-provenance row will then fail the CHECK
  // constraint honestly at the DB layer rather than on a fabricated derivation here.
  if (!provenanceErr && provenanceRow && typeof provenanceRow.quote === 'string' && provenanceRow.quote) {
    if (!provenanceRow.uttered_at) {
      provenanceUpdate.uttered_at = provenanceRow.ratified_at;
    }
    if (!provenanceRow.quote_hash) {
      provenanceUpdate.quote_hash = createHash('sha256').update(provenanceRow.quote, 'utf8').digest('hex');
    }
    if (!provenanceRow.transcript_ref) {
      provenanceUpdate.transcript_ref = `${provenanceRow.source} + encoded_ref:${JSON.stringify(ref)}`;
    }
  }

  const { data, error } = await supabase
    .from('chairman_ratifications')
    .update({
      encoded_at: new Date().toISOString(),
      encoded_ref: ref,
      marker_text: trimmedMarker,
      ...provenanceUpdate,
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

  // FR-3: persist the attempt that just (or, on a lost race, almost) wrote encoded_at.
  // encoded_at_persisted reflects the REAL outcome of the .is('encoded_at', null) update, which
  // can legitimately be 0 if a concurrent caller encoded the row first — 'verified' does not imply
  // persisted (the DDL deliberately leaves this pair unconstrained for exactly that race).
  //
  // outcome='verified' is reserved for a GENUINELY pin-backed read (content_verified_at_pin) —
  // a case that read via the working-tree fallback (pin resolved but unreadable at it, or no pin
  // at all) still proceeded (only reason==='no_commit_pin' is refused, above) but is recorded as
  // 'unverifiable_infrastructure' so the ledger never claims pin evidence it did not actually have.
  // commit_sha/marker_offset/file_sha256 are only ever populated together with a resolved commit
  // (hasCommit), satisfying crv_marker_offset_requires_a_read regardless of which bucket applies.
  const hasCommit = isSectionId && !!markerVerification.commit;
  const isPinVerified = isSectionId && markerVerification.content_verified_at_pin === true;
  await recordVerificationAttempt(supabase, {
    targetRatificationId: ratificationId, attemptKind: 'live_encode',
    outcome: !isSectionId ? 'not_applicable' : (isPinVerified ? 'verified' : 'unverifiable_infrastructure'),
    encodedAtPersisted: rows.length > 0,
    pinTier: isSectionId ? (markerVerification.pin_tier || null) : null,
    commitSha: hasCommit ? markerVerification.commit : null,
    targetFile: isSectionId ? (markerVerification.target_file || null) : null,
    contentRead: hasCommit && typeof markerVerification.content === 'string' ? markerVerification.content : null,
    markerOffset: hasCommit && typeof markerVerification.content === 'string'
      ? markerVerification.content.indexOf(trimmedMarker)
      : null,
    attemptedEncodedRef: ref, attemptedMarkerText: trimmedMarker,
    reason: !isSectionId ? 'not_applicable_for_ref_type' : (isPinVerified ? null : (markerVerification.reason || 'unpinned_fallback_read')),
    producer: PRODUCER, runId, detail: markerVerification,
  });

  return {
    affected: rows.length,
    row: rows[0] || null,
    marker_verification: markerVerification,
    // Countable rather than invisible (same reasoning as marker_verification's own addition):
    // which fields, if any, were derived at mark time rather than captured at insert time.
    provenance_derived: Object.keys(provenanceUpdate),
  };
}

export { VALID_TARGET_CONTRACTS, ENCODED_REF_SHAPES };

