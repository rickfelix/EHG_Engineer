/**
 * YouTube backlog-clear — SD-LEO-INFRA-DISTILL-YT-REVIEW-GAP-AND-BACKLOG-CLEAR-001 (FR-2).
 *
 * Pure planning helpers for clearing the classified+unreviewed eva_youtube_intake backlog by the
 * chairman's "auto-route by AI-rec" method: each row's EXISTING ai-classified chairman_intent IS the
 * routing decision. We do not invent a verdict — reference/insight route to the reference lane
 * (excluded from wave clustering), idea routes to the wave lane. Rows whose intent is null or outside
 * the routable set are SKIPPED (reported, never silently mis-laned) per the PLAN DB/security review.
 *
 * The physical playlist move is NOT done here — the CLI delegates it to the proven
 * lib/integrations/post-processor.js (insert-to-Processed-then-delete, fail-safe + idempotent).
 *
 * @module lib/eva/youtube-backlog-clear
 */

/** capture-intents that map to the reference lane (stored for lookup, excluded from wave clustering). */
const REFERENCE_INTENTS = new Set(['reference', 'insight']);
/** capture-intents that map to the wave lane (genuine ideas that should reach wave clustering). */
const WAVE_INTENTS = new Set(['idea']);

/**
 * Derive the routing lane from a row's existing AI chairman_intent. Returns null for an intent that
 * is missing or outside the routable set (question/value/unknown) — caller SKIPS these.
 * @param {string|null|undefined} chairmanIntent
 * @returns {'reference'|'wave'|null}
 */
export function deriveLane(chairmanIntent) {
  const intent = (chairmanIntent || '').toLowerCase();
  if (REFERENCE_INTENTS.has(intent)) return 'reference';
  if (WAVE_INTENTS.has(intent)) return 'wave';
  return null;
}

/**
 * Build the backlog-clear plan from the classified+unreviewed rows. PURE.
 * Splits rows into:
 *   - toRoute: rows with a routable intent → will be stamped reviewed (auto-routed); each carries lane.
 *   - toSkip:  rows whose intent is null/non-routable → reported, untouched.
 * Of the routable rows, those still unprocessed (processed_at null) AND with a youtube_playlist_item_id
 * are the ones the physical move will relocate (toMove) — the rest are already physically in Processed.
 *
 * @param {Array<object>} rows eva_youtube_intake rows (classified_at set, chairman_reviewed_at null)
 * @returns {{ total:number, toRoute:Array, toSkip:Array, toMove:Array, byLane:object, skipReasons:object }}
 */
export function planBacklogClear(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const toRoute = [];
  const toSkip = [];
  const byLane = { reference: 0, wave: 0 };
  const skipReasons = {};

  for (const r of list) {
    const lane = deriveLane(r.chairman_intent);
    if (!lane) {
      const reason = r.chairman_intent ? `non_routable_intent:${r.chairman_intent}` : 'null_intent';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      toSkip.push({ id: r.id, chairman_intent: r.chairman_intent ?? null });
      continue;
    }
    byLane[lane]++;
    toRoute.push({ ...r, lane });
  }

  // Only unprocessed rows with a deletable playlist-item id are physically relocated by the move.
  const toMove = toRoute.filter((r) => !r.processed_at && r.youtube_playlist_item_id);

  return { total: list.length, toRoute, toSkip, toMove, byLane, skipReasons };
}

/**
 * Select the reference-lane rows from a planBacklogClear() result. ADDITIVE seam —
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A. Before this child the reference lane
 * dead-ended (excluded from wave clustering, no consumer). The RESEARCH_INTELLIGENCE_OPERATOR
 * consumes exactly these rows for triage (see lib/agents/research-intelligence-operator.js
 * triageBacklogReferenceLane). Kept here as a producer-side selector so youtube-backlog-clear
 * does not depend on the operator (consumer reads producer, never the reverse). PURE.
 *
 * @param {{ toRoute?: Array<object> }} plan the object returned by planBacklogClear
 * @returns {Array<object>} the reference-lane rows (lane === 'reference')
 */
export function selectReferenceLane(plan) {
  const toRoute = Array.isArray(plan?.toRoute) ? plan.toRoute : [];
  return toRoute.filter((r) => r?.lane === 'reference');
}
