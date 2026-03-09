/**
 * Refine: Deduplication Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * Identifies duplicate and near-duplicate items within roadmap waves.
 * Two modes:
 *   - **Inline** (default via /distill refine): Extracts context for Claude Code
 *     to perform semantic dedup directly with full contextual understanding
 *   - **Keyword**: Fast fallback that groups items with identical normalized titles
 *
 * Dedup groups are tagged but items are NOT auto-removed.
 * The Chairman reviews dedup suggestions before any items are merged/removed.
 */

const DEDUP_CONFIG = {
  SIMILARITY_THRESHOLD: 0.75,
  MAX_ITEMS_PER_BATCH: 150,
};

// ─── Inline Mode: Extract context for Claude Code ──────────

/**
 * Extract dedup context for Claude Code inline analysis.
 * Returns structured data for Claude Code to semantically identify duplicates.
 *
 * @param {Array} items - Wave items to deduplicate
 * @param {Object} [waveInfo] - Optional wave metadata
 * @returns {Object} Context for Claude Code to analyze
 */
export function extractDedupContext(items, waveInfo = {}) {
  const itemSummaries = items.map((item, i) => ({
    index: i + 1,
    title: (item.title || '(untitled)').slice(0, 200),
    description: (item.description || '').slice(0, 150),
    source_type: item.source_type || '',
    target_application: item.target_application || '',
    chairman_intent: item.chairman_intent || '',
  }));

  return {
    mode: 'DEDUP_CONTEXT',
    wave_title: waveInfo.title || '',
    wave_description: waveInfo.description || '',
    item_count: items.length,
    instruction: `Find groups of duplicate or near-duplicate items — same idea expressed differently.

Rules:
- Match on MEANING, not just keywords. "Add dark mode" and "Implement theme switching" are duplicates.
- Items from different sources (todoist vs youtube) can still be duplicates if about the same topic.
- YouTube videos about the same tool/topic (e.g., multiple OpenClaw tutorials) should be grouped.
- Items with the same chairman_intent AND overlapping scope are likely duplicates.
- Short/vague items (single words like "script") should NOT be grouped unless clearly identical.
- Each item should appear in at most ONE group.
- Groups must have at least 2 items.
- item_indices are 1-based.

Respond with JSON:
{"groups": [{"item_indices": [1, 3], "reason": "Both about implementing dark mode"}, {"item_indices": [5, 8, 12], "reason": "All OpenClaw integration tutorials"}]}`,
    items: itemSummaries,
  };
}

/**
 * Parse dedup response (from Claude Code inline or any JSON source).
 * @param {string|Object} response
 * @param {number} itemCount
 * @returns {{ groups: Array<{item_indices: number[], reason: string}> } | null}
 */
export function parseDedupResponse(response, itemCount) {
  try {
    let parsed = response;
    if (typeof response === 'string') {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    }
    if (!parsed.groups || !Array.isArray(parsed.groups)) return null;

    for (const g of parsed.groups) {
      if (!Array.isArray(g.item_indices) || g.item_indices.length < 2) return null;
      if (g.item_indices.some(i => i < 1 || i > itemCount)) return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ─── Keyword Mode: Fast fallback ───────────────────────────

/**
 * Keyword-based fallback dedup — groups items with identical normalized titles.
 * @param {Array<{title: string}>} items
 * @returns {{ groups: Array<{item_indices: number[], reason: string}> }}
 */
export function keywordDedup(items) {
  const normalized = new Map();

  items.forEach((item, i) => {
    const key = (item.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!key) return;

    if (!normalized.has(key)) normalized.set(key, []);
    normalized.get(key).push(i + 1);
  });

  const groups = [];
  for (const [, indices] of normalized) {
    if (indices.length >= 2) {
      groups.push({
        item_indices: indices,
        reason: 'Identical normalized titles',
      });
    }
  }

  return { groups };
}

/**
 * Run keyword dedup (used when running pipeline standalone without Claude Code inline).
 * @param {Array} items - Items to deduplicate
 * @returns {Promise<{ groups: Array<{item_indices: number[], reason: string}>, method: 'keyword' }>}
 */
export async function dedup(items) {
  if (!items || items.length < 2) {
    return { groups: [], method: 'keyword' };
  }

  const batch = items.slice(0, DEDUP_CONFIG.MAX_ITEMS_PER_BATCH);
  return { ...keywordDedup(batch), method: 'keyword' };
}

export { DEDUP_CONFIG };
