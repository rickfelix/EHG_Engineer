/**
 * Triage Classifier — PURE, rule-based, idempotent.
 * SD-LEO-INFRA-UNIFY-INTAKE-POOLS-001 (FR-3)
 *
 * classify(normalizedItem, { existingSds, capabilities }) -> verdict. No DB, no
 * I/O, no content judgment — only deterministic rules. Reuses the existing
 * scope-similarity dedup (Jaccard >= 0.5). Same input -> same output (idempotent).
 *
 * Disposition semantics:
 *   dismissed        — advisory/research or already covered (NOT an SD candidate)
 *   merged_duplicate — exact or Jaccard match to an existing SD
 *   deferred         — ambiguous/generic; needs human eyes (never auto-promoted)
 *   converted        — novel + aligned; promote=true (the drain materializes the SD)
 */

import { extractKeywords, calculateSimilarity, extractSDKeywords } from '../../scripts/modules/handoff/validation/scope-similarity.js';

const JACCARD_DUP_THRESHOLD = 0.5;       // >= this vs an SD => duplicate
const CAPABILITY_COVER_THRESHOLD = 0.5;  // >= this vs a capability => already covered
const WEAK_MATCH_THRESHOLD = 0.3;        // counts toward "matches many" for the guard
const GENERIC_KEYWORD_MAX = 2;           // <= this many keywords => "generic" title
const AMBIGUOUS_MIN_WEAK_MATCHES = 4;    // generic + this many weak matches => deferred

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * @param {Object} item - normalized intake item {title, description, action_type?, ...}
 * @param {Object} ctx
 * @param {Array}  ctx.existingSds  - [{sd_key, title, scope, description, key_changes}]
 * @param {Array} [ctx.capabilities] - [{name, description}]
 * @returns {{disposition:string, triage_verdict:string, dedup_match_sd_key:?string, dedup_score:?number, dismiss_reason:?string, promote:boolean}}
 */
export function classify(item, ctx = {}) {
  const existingSds = Array.isArray(ctx.existingSds) ? ctx.existingSds : [];
  const capabilities = Array.isArray(ctx.capabilities) ? ctx.capabilities : [];
  const existingSdKeys = ctx.existingSdKeys instanceof Set
    ? ctx.existingSdKeys
    : new Set(Array.isArray(ctx.existingSdKeys) ? ctx.existingSdKeys : []);
  const base = { disposition: null, triage_verdict: null, dedup_match_sd_key: null, dedup_score: null, dismiss_reason: null, promote: false };

  // (0) Key dedup — an item whose proposed/source key is ALREADY an SD is already
  // materialized (e.g. a PROPOSAL-*.json whose SD shipped). Runs first; Pool-1
  // source_external_id is a trend_id (uuid) and will not collide with sd_keys.
  const extKey = item.source_external_id;
  if (extKey && existingSdKeys.has(extKey)) {
    return { ...base, disposition: 'merged_duplicate', triage_verdict: 'already_materialized', dedup_match_sd_key: extKey, dedup_score: 1.0 };
  }

  // (a) Action-type advisory filters (Pool-1). These are deterministic non-SD classes.
  const action = (item.action_type || '').toLowerCase();
  if (action === 'review') {
    return { ...base, disposition: 'dismissed', triage_verdict: 'advisory_review', dismiss_reason: 'advisory_review_not_sd_candidate' };
  }
  if (action === 'research') {
    return { ...base, disposition: 'dismissed', triage_verdict: 'research_directive', dismiss_reason: 'research_directive_not_sd_candidate' };
  }

  // (b) Dedup vs existing SDs — exact title, then Jaccard.
  const itemTitleNorm = normTitle(item.title);
  const itemKws = extractKeywords(`${item.title || ''} ${item.description || ''}`);

  let best = { key: null, score: 0 };
  let weakMatches = 0;
  for (const sd of existingSds) {
    if (sd && normTitle(sd.title) === itemTitleNorm && itemTitleNorm.length > 0) {
      return { ...base, disposition: 'merged_duplicate', triage_verdict: 'exact_duplicate', dedup_match_sd_key: sd.sd_key, dedup_score: 1.0 };
    }
    const score = calculateSimilarity(itemKws, extractSDKeywords(sd || {}));
    if (score > best.score) best = { key: sd && sd.sd_key, score };
    if (score >= WEAK_MATCH_THRESHOLD) weakMatches++;
  }
  if (best.score >= JACCARD_DUP_THRESHOLD) {
    return { ...base, disposition: 'merged_duplicate', triage_verdict: 'jaccard_duplicate', dedup_match_sd_key: best.key, dedup_score: Number(best.score.toFixed(3)) };
  }

  // (c) Capability coverage (soft) — already solved by an existing capability.
  for (const cap of capabilities) {
    const capKws = extractKeywords(`${cap.name || ''} ${cap.description || ''}`);
    if (calculateSimilarity(itemKws, capKws) >= CAPABILITY_COVER_THRESHOLD) {
      return { ...base, disposition: 'dismissed', triage_verdict: 'covered_by_capability', dismiss_reason: 'already_covered_by_capability' };
    }
  }

  // (d) CONSERVATIVE guard — a generic/low-signal title that weakly matches many SDs
  // is NOT auto-promoted and NOT mass-dismissed; it is deferred for human eyes.
  if (itemKws.size <= GENERIC_KEYWORD_MAX && weakMatches >= AMBIGUOUS_MIN_WEAK_MATCHES) {
    return { ...base, disposition: 'deferred', triage_verdict: 'ambiguous_generic', dedup_score: best.score ? Number(best.score.toFixed(3)) : null };
  }

  // (e) Novel + aligned -> promote. Disposition 'converted' is the INTENDED terminal
  // state; the drain only writes it after the SD is actually materialized.
  return { ...base, disposition: 'converted', triage_verdict: 'novel_promote', promote: true, dedup_score: best.score ? Number(best.score.toFixed(3)) : null };
}

export const _thresholds = { JACCARD_DUP_THRESHOLD, CAPABILITY_COVER_THRESHOLD, WEAK_MATCH_THRESHOLD, GENERIC_KEYWORD_MAX, AMBIGUOUS_MIN_WEAK_MATCHES };
