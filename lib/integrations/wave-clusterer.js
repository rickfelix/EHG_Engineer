/**
 * Wave Clusterer — AI-powered grouping of backlog items into roadmap waves
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-C
 *
 * Groups classified intake/backlog items into 2-4 waves based on:
 *   - Semantic similarity (AI) or keyword category (fallback)
 *   - Priority ordering within waves
 *   - Dependency relationships
 *
 * Pattern: AI classification with keyword fallback (intake-classifier.js)
 */

import { getClassificationClient } from '../llm/client-factory.js';
import { WAVE_STATUSES } from './roadmap-taxonomy.js';

const CLUSTER_CONFIG = {
  MIN_WAVES: 2,
  MAX_WAVES: 4,
  MIN_ITEMS_PER_WAVE: 1,
  AI_TIMEOUT_MS: 30000,
};

/**
 * Build the LLM prompt to cluster items into waves.
 * @param {Array<{id: string, title: string, description?: string, priority?: string, category?: string}>} items
 * @returns {string}
 */
export function buildClusteringPrompt(items) {
  const itemList = items.map((item, i) =>
    `  ${i + 1}. [${item.priority || 'medium'}] ${item.title}${item.category ? ` (${item.category})` : ''}`
  ).join('\n');

  return `Group these ${items.length} backlog items into ${CLUSTER_CONFIG.MIN_WAVES}-${CLUSTER_CONFIG.MAX_WAVES} execution waves.

Items:
${itemList}

Grouping criteria:
- Wave 1 = highest priority / foundational items
- Later waves = dependent or lower priority items
- Group thematically similar items together
- Each wave needs a descriptive title

Respond with ONLY valid JSON (no markdown):
{"waves": [{"title": "<wave title>", "description": "<1 sentence>", "item_indices": [1, 2]}]}`;
}

/**
 * Parse AI clustering response into wave assignments.
 * @param {string} response - Raw LLM text
 * @param {number} itemCount - Total items for validation
 * @returns {{ waves: Array<{title: string, description: string, item_indices: number[]}> } | null}
 */
export function parseClusteringResponse(response, itemCount) {
  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.waves || !Array.isArray(parsed.waves)) return null;

    // Validate indices are in range
    const allIndices = parsed.waves.flatMap(w => w.item_indices);
    if (allIndices.some(i => i < 1 || i > itemCount)) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Keyword-based fallback clustering by priority + category.
 * @param {Array<{id: string, title: string, priority?: string, category?: string}>} items
 * @returns {{ waves: Array<{title: string, description: string, item_indices: number[]}> }}
 */
export function keywordCluster(items) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = items.map((item, i) => ({ ...item, originalIndex: i + 1 }))
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  const waveSize = Math.ceil(sorted.length / CLUSTER_CONFIG.MAX_WAVES);
  const waves = [];

  for (let i = 0; i < sorted.length; i += waveSize) {
    const chunk = sorted.slice(i, i + waveSize);
    const waveNum = waves.length + 1;
    waves.push({
      title: `Wave ${waveNum}: ${waveNum === 1 ? 'Foundation' : waveNum === 2 ? 'Core Features' : 'Enhancements'}`,
      description: `${chunk.length} items grouped by priority`,
      item_indices: chunk.map(c => c.originalIndex),
    });
  }

  return { waves };
}

/**
 * Cluster backlog items into waves using AI with keyword fallback.
 * @param {Array<{id: string, title: string, description?: string, priority?: string, category?: string}>} items
 * @returns {Promise<{ waves: Array<{title: string, description: string, item_indices: number[]}>, method: 'ai' | 'keyword' }>}
 */
export async function clusterItems(items) {
  if (!items || items.length === 0) {
    throw new Error('No items to cluster');
  }

  if (items.length < CLUSTER_CONFIG.MIN_WAVES) {
    return {
      waves: [{ title: 'Wave 1: All Items', description: 'Single wave for small backlog', item_indices: items.map((_, i) => i + 1) }],
      method: 'keyword',
    };
  }

  // Try AI clustering
  try {
    const client = getClassificationClient();
    const prompt = buildClusteringPrompt(items);
    const response = await Promise.race([
      client.generate(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), CLUSTER_CONFIG.AI_TIMEOUT_MS)),
    ]);

    const parsed = parseClusteringResponse(response, items.length);
    if (parsed && parsed.waves.length >= CLUSTER_CONFIG.MIN_WAVES) {
      return { ...parsed, method: 'ai' };
    }
  } catch {
    // Fall through to keyword clustering
  }

  return { ...keywordCluster(items), method: 'keyword' };
}

export { CLUSTER_CONFIG };
