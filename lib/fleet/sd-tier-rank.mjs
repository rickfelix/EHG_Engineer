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

const { clamp, ladderTopRank, LADDER } = ladder;

// QF-20260704-717: the fleet-claimable baseline (the ladder's opus/low rung), read directly
// from tier-ladder.cjs's own static LADDER definition rather than a hand-rolled "2" literal.
// (Historical note: this originally also avoided rankForModelEffort() because it returned a
// raw model×effort lattice rank; since QF-20260705-394 that function returns the static-ladder
// dense rank — rankForModelEffort('opus','low') === this rung — so either source now agrees;
// the LADDER read is kept as the more direct expression of "the opus/low rung".)
// QF-20260705-953: opus/low is no longer a literal LADDER entry (the rank-1/rank-2 anchors
// moved to sonnet/low and sonnet/high), so OPUS_LOW_RUNG now resolves via the `: 2` fallback
// below on every call — still correct (rankForModelEffort('opus','low') === 2, unchanged),
// but the "avoid a hand-rolled literal" premise above is inverted until a future rewrite reads
// the value directly off rankForModelEffort('opus','low') instead of an array .find().
// Used by stampPayloadForCreation()'s NO-SIGNAL branch instead of the fail-safe-up top
// rung — a brand-new SD with genuinely no scoreable signal (the common leo-create-sd.js
// --from-plan shape) must default to claimable-by-construction, or it strands invisible at the
// fleet's actual active tier until a human manually re-stamps it (2 occurrences, coordinator-flagged).
const OPUS_LOW_RUNG = LADDER.find((rung) => rung.model === 'opus' && rung.effort === 'low');
export const FLEET_CLAIMABLE_BASELINE_RANK = OPUS_LOW_RUNG ? OPUS_LOW_RUNG.rank : 2;

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

/**
 * Ladder-relative MID rung — the UPPER-middle of the current ladder.
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-D: replaces the hardcoded literal 3 so the mid rung
 * tracks the ladder middle as ladderTopRank() (K) changes (Child -B resizes K), instead of silently
 * drifting out of sync. Math.floor(K/2)+1 is the upper-middle: it yields 3 on the current K=4 ladder
 * (1=sonnet/low, 2=sonnet/high+opus/low, 3=opus/med, 4=opus/high — QF-20260705-953 re-placed rank 1/2)
 * — PRESERVING the documented 'features carry blast radius -> Opus-med floor' guardrail — and
 * scales K=5->3, K=6->4, K=8->5, honoring this
 * module's conservative-up bias. (The SD text said ceil(K/2), which yields 2 at K=4 and would LOOSEN
 * the guardrail to opus/low; a spec-conflict signal was raised — see the SD's TR-1.)
 */
function midRank() {
  return Math.floor(ladderTopRank() / 2) + 1;
}

/** LOC -> rung. tier-2 (31..75) leans the ladder-relative mid rung per the conservative-up bias. */
function locRank(loc) {
  if (!Number.isFinite(loc)) return null;
  if (loc <= TIER1_MAX_LOC) return 1;
  if (loc <= TIER2_MAX_LOC) return midRank();
  return ladderTopRank();
}

/**
 * Score every available signal on an SD row. Shared by computeMinTierRank() (fail-safe-up
 * philosophy) and stampPayloadForCreation() (claimable-by-construction philosophy) so both
 * agree on what counts as "a real signal" from a single source of truth.
 * @param {object} row a strategic_directives_v2-shaped row
 * @returns {{ riskFloor: boolean, contributions: number[] }}
 */
function scoreContributions(row) {
  const text = textOf(row);
  if (text && hasRiskKeyword(text)) return { riskFloor: true, contributions: [] };

  const contributions = [];
  const sdType = String(row.sd_type || '').toLowerCase();
  if (sdType === 'feature') contributions.push(midRank()); // features carry blast radius -> ladder-relative mid (Opus-med floor at K=4)
  if (LIGHTWEIGHT_TYPES.has(sdType)) contributions.push(1);

  const loc = Number(row.estimated_loc != null ? row.estimated_loc : (row.metadata && row.metadata.estimated_loc));
  const lr = locRank(loc);
  if (lr != null) contributions.push(lr);

  const hint = Number(row.metadata && row.metadata.tier_hint);
  if (Number.isFinite(hint)) {
    // work-item tier (1/2/3) -> conservative rung mapping.
    contributions.push(hint <= 1 ? 1 : hint === 2 ? midRank() : ladderTopRank());
  }
  return { riskFloor: false, contributions };
}

/**
 * Compute metadata.min_tier_rank — the cheapest rung that can sufficiently build this SD.
 * Takes the MAX of every available contribution (conservative-up). No scoreable signal
 * (no type, no LOC, no tier_hint, no keyword) => top rung (fail-safe-up).
 * @param {object} sd a strategic_directives_v2-shaped row
 * @returns {number} a rank in [1, ladderTopRank()]
 */
export function computeMinTierRank(sd) {
  const { riskFloor, contributions } = scoreContributions(sd || {});
  if (riskFloor) return ladderTopRank(); // floor: risk/forbidden keyword
  if (contributions.length === 0) return ladderTopRank(); // no scoreable signal -> fail-safe-up
  return clamp(Math.max(...contributions));
}

/** Convenience: the metadata patch a stamping path writes to strategic_directives_v2.metadata. */
export function stampPayload(sd) {
  return { min_tier_rank: computeMinTierRank(sd) };
}

/**
 * Creation-time stamp helper (QF-20260704-717). Unlike stampPayload()'s general complexity
 * rubric (fail-safe-up protects a build already assigned to a worker), a BRAND-NEW SD with
 * genuinely no scoreable signal -- the common leo-create-sd.js --from-plan shape -- must
 * default to CLAIMABLE-BY-CONSTRUCTION, or it strands invisible at the fleet's actual active
 * tier until a human manually re-stamps it. An explicit override always wins (requires a
 * recorded reason -- throws loudly without one); absent that, a no-signal SD gets the
 * fleet-claimable baseline instead of the ladder top, while any SD with a REAL signal (risk
 * keyword / sd_type / LOC / tier_hint) still gets its accurately-computed rank untouched.
 * @param {object} sd a strategic_directives_v2-shaped row
 * @param {{ explicitRank?: number, explicitReason?: string }} [opts]
 * @returns {{ min_tier_rank: number, min_tier_rank_reason?: string }}
 */
export function stampPayloadForCreation(sd, opts = {}) {
  if (opts.explicitRank != null) {
    const reason = opts.explicitReason && String(opts.explicitReason).trim();
    if (!reason) {
      throw new Error('min_tier_rank explicit override requires a recorded reason (--min-tier-rank-reason)');
    }
    return { min_tier_rank: clamp(opts.explicitRank), min_tier_rank_reason: reason };
  }

  const { riskFloor, contributions } = scoreContributions(sd || {});
  if (riskFloor) return { min_tier_rank: ladderTopRank() }; // real signal -> untouched
  if (contributions.length === 0) return { min_tier_rank: Math.min(FLEET_CLAIMABLE_BASELINE_RANK, ladderTopRank()) }; // no signal -> claimable baseline
  return { min_tier_rank: clamp(Math.max(...contributions)) }; // real signal -> untouched
}

export default { computeMinTierRank, stampPayload, stampPayloadForCreation, FLEET_CLAIMABLE_BASELINE_RANK };
