/**
 * Refine: AI Deduplication Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * Identifies duplicate and near-duplicate items within roadmap waves.
 * Uses AI for semantic similarity detection with keyword fallback.
 *
 * Dedup groups are tagged with a dedup_group_id but items are NOT auto-removed.
 * The Chairman reviews dedup suggestions before any items are merged/removed.
 */

import { getClassificationClient } from '../llm/client-factory.js';

const DEDUP_CONFIG = {
  SIMILARITY_THRESHOLD: 0.75,
  AI_TIMEOUT_MS: 60000,
  MAX_ITEMS_PER_BATCH: 100,
};

/**
 * Build prompt to detect duplicates among wave items.
 * @param {Array<{id: string, title: string, source_type: string, target_application: string, chairman_intent: string}>} items
 * @returns {string}
 */
export function buildDedupPrompt(items) {
  const itemList = items.map((item, i) =>
    `  ${i + 1}. [${item.source_type}] [${item.target_application || ''}] ${(item.title || '').slice(0, 120)}`
  ).join('\n');

  return `You are analyzing roadmap wave items for duplicates and near-duplicates.

Items to analyze (${items.length}):
${itemList}

Find groups of items that are duplicates or near-duplicates (same idea expressed differently).

Rules:
- Only group items that are genuinely about the same thing
- Items from different sources (todoist vs youtube) can still be duplicates
- Items in the same application with similar titles/topics are likely duplicates
- If no duplicates exist, return an empty groups array
- item_indices are 1-based (matching the list above)
- Each item should appear in at most ONE group
- Groups must have at least 2 items

Respond with ONLY valid JSON (no markdown, no explanation):
{"groups": [{"item_indices": [1, 3], "reason": "Both about X"}, {"item_indices": [5, 8, 12], "reason": "All about Y"}]}`;
}

/**
 * Parse AI dedup response.
 * @param {string} response
 * @param {number} itemCount
 * @returns {{ groups: Array<{item_indices: number[], reason: string}> } | null}
 */
export function parseDedupResponse(response, itemCount) {
  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.groups || !Array.isArray(parsed.groups)) return null;

    // Validate indices
    for (const g of parsed.groups) {
      if (!Array.isArray(g.item_indices) || g.item_indices.length < 2) return null;
      if (g.item_indices.some(i => i < 1 || i > itemCount)) return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

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
 * Run dedup on a set of wave items using AI with keyword fallback.
 * @param {Array} items - Items to deduplicate
 * @returns {Promise<{ groups: Array<{item_indices: number[], reason: string}>, method: 'ai' | 'keyword' }>}
 */
export async function dedup(items) {
  if (!items || items.length < 2) {
    return { groups: [], method: 'keyword' };
  }

  // Batch if too many items
  const batch = items.slice(0, DEDUP_CONFIG.MAX_ITEMS_PER_BATCH);

  // Try AI dedup
  try {
    const client = await getClassificationClient();
    const prompt = buildDedupPrompt(batch);
    let timeoutId;
    const response = await Promise.race([
      client.complete(
        'You are a deduplication system. Find duplicate items. Respond with only valid JSON.',
        prompt,
        { maxTokens: 4096 }
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI timeout')), DEDUP_CONFIG.AI_TIMEOUT_MS);
        if (timeoutId.unref) timeoutId.unref();
      }),
    ]);
    clearTimeout(timeoutId);

    const text = typeof response === 'string' ? response : response?.content;
    const parsed = parseDedupResponse(text, batch.length);
    if (parsed) {
      return { ...parsed, method: 'ai' };
    }
  } catch (err) {
    console.warn(`  AI dedup failed: ${err.message}. Using keyword fallback.`);
  }

  return { ...keywordDedup(batch), method: 'keyword' };
}

export { DEDUP_CONFIG };
