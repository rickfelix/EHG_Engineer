/**
 * Refine: Promotion Analysis Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * SD-DISTILLTOBRAINSTORM-ORCH-001-C: Legacy Research SD creation removed.
 * All items now go through the brainstorm auto-chain (vision → arch → SD).
 * This module retains only the scoring/grouping logic used by /distill refine.
 */

/**
 * Group scored items by target application for analysis.
 * @param {Array<{item_index: number, composite: number, recommendation: string}>} scoredItems
 * @param {Array} originalItems - Items with metadata
 * @returns {Array<{application: string, items: Array}>}
 */
export function groupForPromotion(scoredItems, originalItems) {
  const promotable = scoredItems.filter(s => s.recommendation === 'promote');
  const groups = {};

  for (const scored of promotable) {
    const item = originalItems[scored.item_index - 1];
    if (!item) continue;

    const app = item.target_application || 'unknown';
    if (!groups[app]) groups[app] = [];
    groups[app].push({ ...item, composite: scored.composite, item_index: scored.item_index });
  }

  return Object.entries(groups).map(([application, items]) => ({
    application,
    items,
  }));
}

/**
 * Process scored items — all promotion now happens via brainstorm auto-chain.
 *
 * Items with brainstorm_session_id already have full SDs created via the
 * brainstorm-to-SD path (vision → arch → SD). This function logs which items
 * were promoted via brainstorm and which were skipped by scoring.
 *
 * @param {Array} scoredItems - Output from refine-score
 * @param {Array} originalItems - Original wave items
 * @param {Object} [options]
 * @returns {Promise<{ promoted: Array<{application: string, item_count: number}>, skipped: number }>}
 */
export async function promote(scoredItems, originalItems, options = {}) {
  const groups = groupForPromotion(scoredItems, originalItems);
  const promoted = [];

  for (const group of groups) {
    const brainstormed = group.items.filter(i => i.brainstorm_session_id);
    const notBrainstormed = group.items.filter(i => !i.brainstorm_session_id);

    if (brainstormed.length > 0) {
      console.log(`  ✅ ${group.application}: ${brainstormed.length} item(s) already have SDs via brainstorm`);
    }

    if (notBrainstormed.length > 0) {
      console.log(`  ⚠️  ${group.application}: ${notBrainstormed.length} item(s) scored for promotion but lack brainstorm session`);
      console.log(`     These items should be processed via /distill brainstorm loop`);
    }

    promoted.push({
      application: group.application,
      item_count: group.items.length,
      brainstormed: brainstormed.length,
      pending: notBrainstormed.length,
    });
  }

  const skipped = scoredItems.filter(s => s.recommendation !== 'promote').length;

  return { promoted, skipped };
}
