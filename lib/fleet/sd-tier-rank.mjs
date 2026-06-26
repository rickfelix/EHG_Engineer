// Complexity rubric: compute the CHEAPEST-SUFFICIENT ladder rung for an SD.
// SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-1).
//
// REUSE: the risk/forbidden keyword lists come from scripts/classify-quick-fix.js
// (CLASSIFICATION_RULES + the word-boundary matchesKeyword) — referenced, NOT
// redefined — and the LOC tiers mirror lib/utils/work-item-router.js DEFAULT_THRESHOLDS
// (tier1_max_loc=30, tier2_max_loc=75). CONSERVATIVE-UP bias throughout: under-powering a
// complex SD costs more than the token savings, so every ambiguity rounds UP and any SD
// with no scoreable signal defaults to the TOP rung (fail-safe-up).

import { matchesKeyword, CLASSIFICATION_RULES } from '../../scripts/classify-quick-fix.js';
import ladder from './tier-ladder.cjs';

const { clamp, ladderTopRank } = ladder;

// LOC tiers mirror lib/utils/work-item-router.js DEFAULT_THRESHOLDS (kept in sync by intent;
// the rubric is a heuristic so the default values are referenced rather than DB-fetched).
const TIER1_MAX_LOC = 30;
const TIER2_MAX_LOC = 75;

// Lightweight SD types (mirror classify-quick-fix allowedTypes) score to the cheapest rung
// unless a stronger signal (LOC / keyword) pushes them up.
const LIGHTWEIGHT_TYPES = new Set(['bug', 'polish', 'typo', 'documentation', 'chore']);

function textOf(sd) {
  return [sd && sd.title, sd && sd.description, sd && sd.scope, sd && sd.strategic_intent]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Any forbidden/risk keyword present => floor to the top rung (blast radius). */
function hasRiskKeyword(text) {
  for (const k of CLASSIFICATION_RULES.forbiddenKeywords) if (matchesKeyword(text, k)) return true;
  for (const k of CLASSIFICATION_RULES.riskKeywords) if (matchesKeyword(text, k)) return true;
  return false;
}

/** LOC -> rung. tier-2 (31..75) leans Opus-med (rank 3) per the conservative-up bias. */
function locRank(loc) {
  if (!Number.isFinite(loc)) return null;
  if (loc <= TIER1_MAX_LOC) return 1;
  if (loc <= TIER2_MAX_LOC) return 3;
  return ladderTopRank();
}

/**
 * Compute metadata.min_tier_rank — the cheapest rung that can sufficiently build this SD.
 * Takes the MAX of every available contribution (conservative-up). No scoreable signal
 * (no type, no LOC, no tier_hint, no keyword) => top rung (fail-safe-up).
 * @param {object} sd a strategic_directives_v2-shaped row
 * @returns {number} a rank in [1, ladderTopRank()]
 */
export function computeMinTierRank(sd) {
  const row = sd || {};
  const text = textOf(row);
  if (text && hasRiskKeyword(text)) return ladderTopRank(); // floor: risk/forbidden keyword

  const contributions = [];
  const sdType = String(row.sd_type || '').toLowerCase();
  if (sdType === 'feature') contributions.push(3); // features carry blast radius -> Opus-med floor
  if (LIGHTWEIGHT_TYPES.has(sdType)) contributions.push(1);

  const loc = Number(row.estimated_loc != null ? row.estimated_loc : (row.metadata && row.metadata.estimated_loc));
  const lr = locRank(loc);
  if (lr != null) contributions.push(lr);

  const hint = Number(row.metadata && row.metadata.tier_hint);
  if (Number.isFinite(hint)) {
    // work-item tier (1/2/3) -> conservative rung mapping.
    contributions.push(hint <= 1 ? 1 : hint === 2 ? 3 : ladderTopRank());
  }

  if (contributions.length === 0) return ladderTopRank(); // no scoreable signal -> fail-safe-up
  return clamp(Math.max(...contributions));
}

/** Convenience: the metadata patch a stamping path writes to strategic_directives_v2.metadata. */
export function stampPayload(sd) {
  return { min_tier_rank: computeMinTierRank(sd) };
}

export default { computeMinTierRank, stampPayload };
