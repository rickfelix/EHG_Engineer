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
});

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Decide whether a staged roadmap_wave_items row is a VALID auto-refill candidate.
 * Checks run in lifecycle-first order so an on-belt / non-staged row reports the lifecycle reason
 * rather than a field gripe. Returns the FIRST failing reason; { valid:true } only when ALL pass.
 *
 * @param {{ item_disposition?:string, promoted_to_sd_key?:(string|null), title?:string,
 *           source_type?:string, source_id?:string, lane?:string }} item  a roadmap_wave_items row
 * @returns {{ valid:boolean, reason:(string|null) }}
 */
export function evaluateRefillCandidate(item) {
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
