// SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-4, chairman-ratified 2026-07-18 via SMS):
// at equal objectively-scored urgency, plan-linked work beats unlinked work. This
// is ONLY a tie-break — it must never be consulted before every prior, objective
// comparator (unlockScore, product-pivot band, needle, priority) has already
// returned 0. It does NOT define a new "urgency" score an item's own metadata
// could inflate; it reads the existing metadata.plan_linkage.linked stamp
// (lib/sd-creation/plan-linkage-classifier.js / lib/coordinator/clear-coordinator-review.js).
//
// Shared by BOTH scripts/coordinator-backlog-rank.mjs's dispatch sort (ESM import)
// and scripts/fleet-dashboard.cjs's fence-lift review ordering (dynamic `import()`
// from CJS) — a single implementation, not a duplicated inline copy, per the SD's
// own acceptance criterion.

/**
 * @param {{metadata?: {plan_linkage?: {linked?: boolean}}}} a
 * @param {{metadata?: {plan_linkage?: {linked?: boolean}}}} b
 * @returns {number} negative if a should sort first (a linked, b not), positive if b
 *   should sort first, 0 if the linkage status is the same (or unknown) on both sides
 */
export function planLinkageCompare(a, b) {
  const la = a?.metadata?.plan_linkage?.linked === true ? 1 : 0;
  const lb = b?.metadata?.plan_linkage?.linked === true ? 1 : 0;
  return lb - la; // linked (1) sorts before unlinked (0)
}

export default { planLinkageCompare };
