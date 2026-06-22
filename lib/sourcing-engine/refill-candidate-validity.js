/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-A (FOUNDATION) — pure candidate-validity predicate.
 *
 * The auto-refill feature closes the staged->belt gap: proactive-populator.js STAGES roadmap_wave_items
 * at item_disposition='pending' and never sets promoted_to_sd_key (it stages-then-stops), so hundreds of
 * staged items sit on the shelf until the coordinator hand-promotes them (an anti-pattern). The sibling
 * children (-B dry-run verifier, -C auto-refill cron, -D claim-eligibility wire, -E coordinator awareness)
 * all need ONE decision: is a given staged roadmap_wave_items row a VALID candidate to auto-promote onto
 * the belt? This is that single PURE SSOT.
 *
 * CONSERVATIVE by design: default INVALID unless the item clearly qualifies, so auto-refill never promotes
 * malformed / already-promoted / duplicate / fixture junk. Lane/outcome ROUTING (which lane a valid
 * candidate belongs to) is intentionally NOT decided here — that is the consumers' job; this predicate only
 * answers the lifecycle/structural question "is this a well-formed, staged, un-promoted, real candidate".
 *
 * PURE: no DB, no fs, no clock. TOTAL: never throws on odd input.
 * ESM module (this repo is type:module; .js === ESM — mirrors lib/sourcing-engine/register-first.js).
 */

// Canonical fixture-key pattern (mirrors lib/fleet/claim-eligibility.cjs TEST_FIXTURE_KEY_RE) so a
// TEST/DEMO fixture seeded into the corpus is never auto-promoted onto the real belt.
export const FIXTURE_KEY_RE = /^SD-(DEMO|TEST)\b/i;
// A fixture can also surface as a TEST/DEMO-prefixed title (staged items have no sd_key of their own).
export const FIXTURE_TITLE_RE = /^\s*(SD-)?(DEMO|TEST)\b/i;

export const REFILL_INVALID_REASONS = Object.freeze({
  MISSING_ITEM: 'missing_item',
  ALREADY_PROMOTED: 'already_promoted',
  NOT_STAGED: 'not_staged',
  DECLINED_LANE: 'declined_lane',
  MISSING_TITLE: 'missing_title',
  MISSING_PROVENANCE: 'missing_provenance',
  TEST_FIXTURE: 'test_fixture',
  // SD-LEO-INFRA-AUTO-REFILL-CANDIDATE-001 — the SOURCE-TYPE class: some corpora are measurement/gauge
  // tables whose "items" are desired-state criteria, not buildable engineering work.
  NON_BUILDABLE_SOURCE: 'non_buildable_source',
  // SD-LEO-INFRA-AUTO-REFILL-BELT-001 — belt-quality axes (run AFTER the structural axes above).
  SUBSTANCE_THIN: 'substance_thin',
  ALREADY_SHIPPED_LOOKALIKE: 'already_shipped_lookalike',
});

// SD-LEO-INFRA-AUTO-REFILL-CANDIDATE-001 — source types that are NEVER buildable engineering work and
// must never be auto-promoted onto the belt. vdr_gauge items come from vision_build_gauge (a metrics
// table: overall_pct, total_capabilities, measured_at); their "titles" are vision-ladder CAPABILITY
// CRITERIA (measured desired-states, e.g. "Governance cascade enforced") — no code target, no defect.
// brainstorm / conversion_ledger / adam-direct sources remain buildable. Extend this set as new
// non-buildable measurement/gauge corpora surface.
export const NON_BUILDABLE_SOURCE_TYPES = new Set(['vdr_gauge']);

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

// SD-LEO-INFRA-AUTO-REFILL-BELT-001 (FR-1): the proactive-populator truncates a long captured title to
// 120 chars and appends a '...' ellipsis marker. Live ground truth: 173/staged-pending rows are EXACTLY
// length 120 ending '...', and NO shorter length ends '...'. Such a title is a substance-thin SHELL — the
// real content was cut, so the SD would carry only a fragment. Anchored on BOTH the cap AND the '...'
// marker so a short title that legitimately ends in '...' is never falsely flagged (conservative).
export const TITLE_TRUNCATION_CAP = 120;

/**
 * Is this title a truncation shell (substance-thin)? PURE/TOTAL.
 * @param {string} title
 * @returns {boolean}
 */
export function isSubstanceThinTitle(title) {
  if (typeof title !== 'string') return false;
  const t = title.trim();
  return t.length >= TITLE_TRUNCATION_CAP && t.endsWith('...');
}

// SD-LEO-INFRA-BELT-001-PART-001 (FR-3 recovery): a 120-char truncated TITLE is only a deceptive
// shell because the populator historically dropped feedback.description. Once the full substance is
// recovered (carried into roadmap_wave_items.metadata.description by the populator / one-shot
// backfill), a truncated-title item is NO LONGER substance-thin — it has real recovered content.
// This floor distinguishes a real recovered body (live feedstock descriptions run ~180-400 chars)
// from a trivial stub, and rejects a "description" that is itself merely the truncation shell.
export const MIN_RECOVERED_SUBSTANCE_LEN = 40;

/**
 * Does this staged item carry a SUBSTANTIAL recovered description (the full source substance the
 * populator now carries into metadata.description)? PURE/TOTAL. A description that is itself a
 * truncation shell, or shorter than MIN_RECOVERED_SUBSTANCE_LEN, does NOT count as recovered substance.
 * @param {{ metadata?:object, description?:string }} item
 * @returns {boolean}
 */
export function hasRecoveredSubstance(item) {
  if (!item || typeof item !== 'object') return false;
  const md = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  // Accept the carried metadata.description (canonical) or a top-level description, for callers that
  // pass the recovered body directly.
  const raw = nonEmpty(md.description) ? md.description : (nonEmpty(item.description) ? item.description : '');
  const d = typeof raw === 'string' ? raw.trim() : '';
  if (d.length < MIN_RECOVERED_SUBSTANCE_LEN) return false;
  // A "description" that is itself a 120-char truncation shell is not recovered substance.
  if (isSubstanceThinTitle(d)) return false;
  return true;
}

/**
 * Normalize a title for the shipped-lookalike axis (FR-2): lowercase, strip a trailing truncation
 * ellipsis, strip a leading "SD-KEY:" prefix if present, collapse internal whitespace, trim. EXACT
 * normalized equality only — no fuzzy/prefix matching, so two titles match iff they are the same string
 * modulo case/ws/ellipsis (e.g. a re-promoted truncated title vs its already-shipped truncated twin).
 * PURE/TOTAL.
 * @param {string} title
 * @returns {string}
 */
export function normalizeTitleForCompare(title) {
  if (typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/\.\.\.\s*$/, '')
    .replace(/^\s*sd-[a-z0-9-]+:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * SD-LEO-INFRA-BELT-001-PART-001 (FR-2): bounded, ADVISORY shipped-SD cross-reference. Complements the
 * exact-match already_shipped_lookalike axis (which fires on a normalized-equal title) by surfacing a
 * candidate whose normalized title is a PREFIX of (or equals) an already-shipped title — the common
 * shape of a truncated re-promotion of work that already shipped under a longer title. ADVISORY by
 * design: it returns the matched shipped title (or null) for the caller to LOG; it does NOT change the
 * {valid,reason} verdict (advisory-default — promote to a hard reason only once the FP rate is measured,
 * the safe-rollout pattern). BOUNDED: iterates the caller-injected shippedTitleSet, which the caller
 * builds once per <=10-row promotion batch (never a full-corpus scan). PURE/TOTAL.
 *
 * @param {string} title  the candidate title
 * @param {Set<string>} shippedTitleSet  normalizeTitleForCompare() keys of shipped/in-progress SD titles
 * @returns {string|null}  the matched normalized shipped key, or null when no advisory match
 */
// Minimum normalized stem length for a PREFIX cross-ref match; below it, only exact match counts.
export const MIN_CROSSREF_STEM_LEN = 12;

export function crossRefShippedTitleAdvisory(title, shippedTitleSet) {
  if (!shippedTitleSet || typeof shippedTitleSet.has !== 'function') return null;
  const norm = normalizeTitleForCompare(title);
  if (!norm) return null;
  // Guard against a trivially-short normalized title prefix-matching many shipped titles: below this
  // stem floor, only an EXACT match counts. A real title stem (e.g. "harden the worktree reaper") is
  // well above it, so the truncated-prefix case is still caught.
  if (norm.length < MIN_CROSSREF_STEM_LEN) return shippedTitleSet.has(norm) ? norm : null;
  for (const shipped of shippedTitleSet) {
    if (typeof shipped !== 'string') continue;
    if (shipped === norm || shipped.startsWith(norm) || norm.startsWith(shipped)) return shipped;
  }
  return null;
}

/**
 * Decide whether a staged roadmap_wave_items row is a VALID auto-refill candidate.
 * Checks run in lifecycle-first order so an on-belt / non-staged row reports the lifecycle reason
 * rather than a field gripe. Returns the FIRST failing reason; { valid:true } only when ALL pass.
 *
 * @param {{ item_disposition?:string, promoted_to_sd_key?:(string|null), title?:string,
 *           source_type?:string, source_id?:string, lane?:string }} item  a roadmap_wave_items row
 * @param {{ shippedTitleSet?:Set<string> }} [opts]  SD-LEO-INFRA-AUTO-REFILL-BELT-001 (FR-3): an OPTIONAL
 *        injected Set of normalizeTitleForCompare() keys of already-shipped/completed SD titles. Default
 *        empty -> the lookalike axis no-ops (backward compatible). The CALLER builds this once per <=10-row
 *        batch via a bounded query, keeping this predicate PURE and O(1) per item.
 * @returns {{ valid:boolean, reason:(string|null) }}
 */
export function evaluateRefillCandidate(item, opts = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM };
  }
  // Lifecycle first: an item already promoted to the belt, or not in the staged ('pending') state, is
  // not a refill candidate regardless of its fields.
  if (nonEmpty(item.promoted_to_sd_key)) {
    return { valid: false, reason: REFILL_INVALID_REASONS.ALREADY_PROMOTED };
  }
  if (item.item_disposition !== 'pending') {
    return { valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED };
  }
  // A lane explicitly routed away from the belt must never be auto-promoted.
  if (typeof item.lane === 'string' && item.lane.trim().toLowerCase() === 'decline') {
    return { valid: false, reason: REFILL_INVALID_REASONS.DECLINED_LANE };
  }
  // SD-LEO-INFRA-AUTO-REFILL-CANDIDATE-001: SOURCE-TYPE class — reject corpora that are non-buildable by
  // nature (measurement/gauge desired-states, not engineering work). Runs after the lifecycle checks
  // (an already-promoted/non-staged row still reports its lifecycle reason) and before the structural
  // title/provenance checks (a non-buildable source is rejected regardless of how well-formed its
  // fields are). Buildable corpora (brainstorm/conversion_ledger/adam-direct) fall straight through.
  if (typeof item.source_type === 'string' && NON_BUILDABLE_SOURCE_TYPES.has(item.source_type.trim())) {
    return { valid: false, reason: REFILL_INVALID_REASONS.NON_BUILDABLE_SOURCE };
  }
  // Structural: an SD cannot be created without a title, and provenance must be traceable.
  if (!nonEmpty(item.title)) {
    return { valid: false, reason: REFILL_INVALID_REASONS.MISSING_TITLE };
  }
  if (!nonEmpty(item.source_type) || !nonEmpty(item.source_id)) {
    return { valid: false, reason: REFILL_INVALID_REASONS.MISSING_PROVENANCE };
  }
  // Never auto-promote a TEST/DEMO fixture into the real belt.
  if (FIXTURE_TITLE_RE.test(item.title) ||
      (nonEmpty(item.source_id) && FIXTURE_KEY_RE.test(item.source_id))) {
    return { valid: false, reason: REFILL_INVALID_REASONS.TEST_FIXTURE };
  }
  // Belt-quality axes (SD-LEO-INFRA-AUTO-REFILL-BELT-001), run LAST so a structurally-broken row still
  // reports its structural reason first. (1) substance: a 120-char truncation shell carries only a
  // fragment. (2) lookalike: a title that normalizes to an already-shipped SD's title is a stale
  // re-promotion. Both conservative — they never fire on a well-formed, novel, full-length title.
  // SD-LEO-INFRA-BELT-001-PART-001 (FR-3 recovery): a truncated-title shell is substance_thin ONLY
  // when no substantial recovered description exists. The populator now carries feedback.description
  // into metadata.description (and a one-shot backfill recovers it for the existing truncated rows),
  // so a truncated title WITH real recovered content is a valid candidate — not the deceptive shell
  // part-1 rejected. This only LOOSENS the part-1 reject; a full-length title was never thin anyway.
  if (isSubstanceThinTitle(item.title) && !hasRecoveredSubstance(item)) {
    return { valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN };
  }
  const shippedTitleSet = opts && opts.shippedTitleSet;
  if (shippedTitleSet && typeof shippedTitleSet.has === 'function' &&
      shippedTitleSet.has(normalizeTitleForCompare(item.title))) {
    return { valid: false, reason: REFILL_INVALID_REASONS.ALREADY_SHIPPED_LOOKALIKE };
  }
  return { valid: true, reason: null };
}

// SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-D — claim-time source-integrity reasons.
// Distinct from the PRE-promotion REFILL_INVALID_REASONS: at claim time the source IS promoted, so
// 'already_promoted'/'not_staged' are EXPECTED states, not failures. Only the invariants that should
// still hold for a still-valid promotion are checked here.
export const REFILL_CLAIM_SOURCE_REASONS = Object.freeze({
  SOURCE_MISSING: 'source_missing',
  SOURCE_UNLINKED: 'source_unlinked',
  DECLINED_LANE: 'declined_lane',
  TEST_FIXTURE: 'test_fixture',
});

/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-D (claim-time complement of evaluateRefillCandidate).
 *
 * Re-validate the SOURCE roadmap_wave_items row of an ALREADY-promoted auto-refill SD at the moment a
 * worker tries to CLAIM the promoted SD. This catches post-promotion drift that promotion-time
 * validation (-A inside -C) cannot see: the source being declined, deleted, or unlinked AFTER the SD was
 * minted onto the belt.
 *
 * Why a separate helper instead of reusing evaluateRefillCandidate: that predicate runs the
 * already_promoted and not_staged axes FIRST, and both are the EXPECTED state once the source has been
 * promoted (promoted_to_sd_key is set; item_disposition is no longer 'pending'). Running it verbatim at
 * claim time would mark every auto-refilled SD invalid — the domain mismatch. So this helper deliberately
 * OMITS those two axes and instead asserts the invariants that must still hold for a valid promotion:
 *   source_missing   — the source row is gone (null/non-object)
 *   source_unlinked  — source.promoted_to_sd_key no longer points back to THIS SD (cleared / re-pointed)
 *   declined_lane    — the source's lane was routed to 'decline' after promotion
 *   test_fixture     — the source is a TEST/DEMO fixture (its minted SD-REFILL-* key hides this from the
 *                      sd_key-based fixture guard in claim-eligibility)
 *
 * Returns the FIRST failing reason; { valid:true, reason:null } only when ALL hold. PURE: no DB/fs/clock.
 * TOTAL: never throws on odd input.
 *
 * @param {{ promoted_to_sd_key?:(string|null), lane?:string, title?:string, source_id?:string }} sourceItem
 *        the SOURCE roadmap_wave_items row the SD was promoted from
 * @param {string} expectedSdKey  the SD key that the source MUST still link back to (SD-REFILL-*)
 * @returns {{ valid:boolean, reason:(string|null) }}
 */
export function evaluateClaimTimeRefillSource(sourceItem, expectedSdKey) {
  if (!sourceItem || typeof sourceItem !== 'object' || Array.isArray(sourceItem)) {
    return { valid: false, reason: REFILL_CLAIM_SOURCE_REASONS.SOURCE_MISSING };
  }
  // The two-way link must still resolve to THIS SD. A null/cleared or re-pointed link means the
  // promotion is stale/orphaned -> do not let a worker build it.
  if (!nonEmpty(sourceItem.promoted_to_sd_key) || sourceItem.promoted_to_sd_key !== expectedSdKey) {
    return { valid: false, reason: REFILL_CLAIM_SOURCE_REASONS.SOURCE_UNLINKED };
  }
  // A lane routed away from the belt after promotion must not remain claimable.
  if (typeof sourceItem.lane === 'string' && sourceItem.lane.trim().toLowerCase() === 'decline') {
    return { valid: false, reason: REFILL_CLAIM_SOURCE_REASONS.DECLINED_LANE };
  }
  // A fixture that slipped onto the belt: the minted SD key is always SD-REFILL-*, so the SD-key fixture
  // guard cannot see a TEST/DEMO source — check the source's own title/source_id here.
  if ((nonEmpty(sourceItem.title) && FIXTURE_TITLE_RE.test(sourceItem.title)) ||
      (nonEmpty(sourceItem.source_id) && FIXTURE_KEY_RE.test(sourceItem.source_id))) {
    return { valid: false, reason: REFILL_CLAIM_SOURCE_REASONS.TEST_FIXTURE };
  }
  return { valid: true, reason: null };
}
