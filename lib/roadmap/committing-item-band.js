/**
 * committing-item-band — SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-3).
 *
 * WHAT WAS ACTUALLY WRONG, measured rather than assumed. The SD asks that the belt ranker JOIN on a
 * plan row so committing-item children outrank harness classes. THE JOIN ALREADY EXISTS —
 * coordinator-backlog-rank.mjs reads roadmap_wave_items.promoted_to_sd_key, builds sdRungMap, and
 * feeds needleScore into the comparator. The defect is POSITION: needle is applied AFTER unlockScore
 * AND AFTER productPivotCompare, so it can only separate candidates that already tie, and can never
 * lift a committing-item child across the harness band. This module supplies the missing BAND.
 *
 * PLACEMENT IS THE WHOLE DESIGN, and it is deliberately narrow:
 *   ABOVE productPivotCompare — so a committing-item child outranks harness-class work, which is the
 *     SD's actual ask and does not happen today.
 *   BELOW unlockScore — so it can NEVER strand the dependency graph. A committing item that outranked
 *     its own unlocker would starve the critical path to serve the plan, which is a worse failure than
 *     the one being fixed. Every other band in this comparator follows the same rule.
 *
 * WHY sdRungMap AND NOT metadata.plan_linkage.linked: the two disagree, and the disagreement is
 * informative. plan_linkage.linked is true on ZERO of 5,533 SDs (all 123 classified rows read false,
 * honestly: 93 harness-upkeep, 28 emergent-fix, 2 venture-ops), while 250 of 254 approved-wave items
 * carry promoted_to_sd_key. So plan_linkage answers "was this SD authored as plan work" and the rung
 * map answers "does this SD descend from a committing item". The BAND needs the second. The existing
 * planLinkageCompare tie-break keeps using the first and is left untouched — it is chairman-ratified
 * (2026-07-18) as an additive tie-break, and it is not broken, only starved.
 */

/** Does this SD descend from a committing item on a canonical wave? */
export function isCommittingItemChild(sd, sdRungMap = {}) {
  const key = sd && sd.sd_key;
  if (!key) return false;
  return sdRungMap[key] !== undefined && sdRungMap[key] !== null;
}

/**
 * Band comparator: committing-item children first. Returns 0 when both sides agree, so the caller
 * falls through to the next comparator unchanged.
 *
 * NOTE THE FAIL-OPEN, INHERITED AND DELIBERATE: sdRungMap is built best-effort upstream — if the
 * roadmap read fails it is empty, every SD reads as non-committing, and this band returns 0 for every
 * pair, leaving ordering exactly as it is today. That is the correct failure direction for a ranking
 * input (degrade to the previous behaviour, never invert it), but it means a silent empty map is
 * indistinguishable from "no committing work is claimable" — which is this SD's own subject. The
 * caller must therefore assert on the observed map size rather than trusting the band ran.
 */
export function committingItemBandCompare(a, b, sdRungMap = {}) {
  const ca = isCommittingItemChild(a, sdRungMap) ? 1 : 0;
  const cb = isCommittingItemChild(b, sdRungMap) ? 1 : 0;
  return cb - ca;
}

export default { isCommittingItemChild, committingItemBandCompare };
