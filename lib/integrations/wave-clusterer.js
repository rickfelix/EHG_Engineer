/**
 * Wave Clusterer — AI-powered grouping of classified intake items into roadmap waves
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-C
 *
 * Reads classified items directly from eva_todoist_intake and eva_youtube_intake,
 * then groups them into 2-6 waves based on:
 *   - Application + Aspects + Intent taxonomy (3D classification)
 *   - Semantic similarity (AI) or keyword category (fallback)
 *   - Priority ordering within waves
 *
 * Supports two modes:
 *   - Full clustering: Groups all classified items into new waves (first run / draft roadmap)
 *   - Incremental assignment: Assigns only new items to existing baselined waves
 *
 * Architecture ref: eva_architecture_plans (DB) — formerly docs/plans/strategic-roadmap-artifact-architecture.md
 */

import { getClassificationClient } from '../llm/client-factory.js';

const CLUSTER_CONFIG = {
  MIN_WAVES: 2,
  MAX_WAVES: 6,
  MIN_ITEMS_PER_WAVE: 1,
  AI_TIMEOUT_MS: 60000,
};

/**
 * Load classified intake items from both Todoist and YouTube intake tables.
 * Only returns items where classification is complete (classified_at IS NOT NULL).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} [options]
 * @param {string} [options.application] - Filter by target_application
 * @param {number} [options.limit] - Max items to return (default: 500)
 * @returns {Promise<Array<{id: string, title: string, description: string, source_type: string, target_application: string, target_aspects: string[], chairman_intent: string}>>}
 */
export async function loadClassifiedIntakeItems(supabase, options = {}) {
  const limit = options.limit || 500;
  const items = [];

  // Todoist items
  const todoistQuery = supabase
    .from('eva_todoist_intake')
    .select('id, title, description, target_application, target_aspects, chairman_intent, classification_confidence, created_at')
    .not('classified_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (options.application) {
    todoistQuery.eq('target_application', options.application);
  }

  const { data: todoist, error: tdErr } = await todoistQuery;
  if (tdErr) console.warn(`  Warning: Todoist query error: ${tdErr.message}`);

  for (const row of todoist || []) {
    items.push({ ...row, source_type: 'todoist' });
  }

  // YouTube items
  const youtubeQuery = supabase
    .from('eva_youtube_intake')
    .select('id, title, description, target_application, target_aspects, chairman_intent, classification_confidence, created_at')
    .not('classified_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (options.application) {
    youtubeQuery.eq('target_application', options.application);
  }

  const { data: youtube, error: ytErr } = await youtubeQuery;
  if (ytErr) console.warn(`  Warning: YouTube query error: ${ytErr.message}`);

  for (const row of youtube || []) {
    items.push({ ...row, source_type: 'youtube' });
  }

  return items.slice(0, limit);
}

/**
 * Load classified intake items that are NOT yet assigned to any roadmap wave.
 * Used for incremental mode — only returns items that need wave assignment.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} [options]
 * @param {string} [options.application] - Filter by target_application
 * @param {number} [options.limit] - Max items to return (default: 500)
 * @returns {Promise<Array>}
 */
export async function loadNewIntakeItems(supabase, options = {}) {
  // Get all source_ids already assigned to a wave
  const { data: assigned } = await supabase
    .from('roadmap_wave_items')
    .select('source_id');

  const assignedIds = new Set((assigned || []).map(r => r.source_id));

  // Load all classified items, then filter out already-assigned ones
  const allItems = await loadClassifiedIntakeItems(supabase, options);
  return allItems.filter(item => !assignedIds.has(item.id));
}

/**
 * Build the LLM prompt to assign new items into existing waves.
 * @param {Array} items - New items to assign
 * @param {Array<{title: string, description: string, sample_titles: string[]}>} existingWaves
 * @returns {string}
 */
export function buildAssignmentPrompt(items, existingWaves) {
  const waveList = existingWaves.map((w, i) =>
    `  ${i + 1}. "${w.title}" — ${w.description}${w.sample_titles.length > 0 ? '\n     Examples: ' + w.sample_titles.slice(0, 5).join(', ') : ''}`
  ).join('\n');

  const itemList = items.map((item, i) =>
    `  ${i + 1}. [${item.target_application}] [${item.chairman_intent}] ${(item.title || '').slice(0, 100)} (aspects: ${(item.target_aspects || []).join(', ')})`
  ).join('\n');

  return `You are assigning new intake items to existing roadmap waves.

The roadmap has been baselined with these approved waves:
${waveList}

Assign each of these ${items.length} new items to the BEST matching existing wave.
If an item clearly does not fit ANY existing wave, assign it to wave 0 (unmatched).

New items:
${itemList}

Respond with ONLY valid JSON (no markdown, no explanation):
{"assignments": [{"item_index": 1, "wave_index": 2}, {"item_index": 2, "wave_index": 1}]}

Rules:
- item_index is 1-based (matching the item list above)
- wave_index is 1-based (matching the wave list above), or 0 for unmatched
- Every item must appear exactly once
- Prefer matching by application and thematic similarity
- Only use wave 0 if the item truly doesn't fit any wave`;
}

/**
 * Parse AI assignment response.
 * @param {string} response - Raw LLM text
 * @param {number} itemCount
 * @param {number} waveCount
 * @returns {{ assignments: Array<{item_index: number, wave_index: number}> } | null}
 */
export function parseAssignmentResponse(response, itemCount, waveCount) {
  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.assignments || !Array.isArray(parsed.assignments)) return null;

    // Validate indices
    for (const a of parsed.assignments) {
      if (a.item_index < 1 || a.item_index > itemCount) return null;
      if (a.wave_index < 0 || a.wave_index > waveCount) return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Keyword-based fallback for assigning items to existing waves.
 * Matches by application name in wave title.
 * @param {Array} items
 * @param {Array<{title: string}>} existingWaves
 * @returns {{ assignments: Array<{item_index: number, wave_index: number}> }}
 */
export function keywordAssign(items, existingWaves) {
  const assignments = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const app = item.target_application || '';

    // Try to match by application keyword in wave title
    let bestWave = 0;
    for (let w = 0; w < existingWaves.length; w++) {
      const title = existingWaves[w].title.toLowerCase();
      if (app === 'ehg_engineer' && (title.includes('engineer') || title.includes('protocol') || title.includes('foundational'))) {
        bestWave = w + 1;
        break;
      }
      if (app === 'ehg_app' && (title.includes('chairman') || title.includes('ui') || title.includes('oversight'))) {
        bestWave = w + 1;
        break;
      }
      if (app === 'new_venture' && (title.includes('venture') || title.includes('product') || title.includes('exploration'))) {
        bestWave = w + 1;
        break;
      }
    }

    // Fallback: assign to the largest wave (most general)
    if (bestWave === 0 && existingWaves.length > 0) {
      bestWave = 1;
    }

    assignments.push({ item_index: i + 1, wave_index: bestWave });
  }

  return { assignments };
}

/**
 * Assign new items to existing baselined waves using AI with keyword fallback.
 * @param {Array} items - New items to assign
 * @param {Array<{id: string, title: string, description: string, sample_titles: string[]}>} existingWaves - Current wave info
 * @returns {Promise<{ assignments: Array<{item_index: number, wave_index: number}>, unmatched: number[], method: 'ai' | 'keyword' }>}
 */
export async function assignToExistingWaves(items, existingWaves) {
  if (!items || items.length === 0) {
    return { assignments: [], unmatched: [], method: 'keyword' };
  }

  // Try AI assignment
  try {
    const client = await getClassificationClient();
    const prompt = buildAssignmentPrompt(items, existingWaves);
    let timeoutId;
    const response = await Promise.race([
      client.complete(
        'You are a strategic planning system. Assign items to existing waves. Respond with only valid JSON.',
        prompt,
        { maxTokens: 4096 }
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI timeout')), CLUSTER_CONFIG.AI_TIMEOUT_MS);
        if (timeoutId.unref) timeoutId.unref();
      }),
    ]);
    clearTimeout(timeoutId);

    const text = typeof response === 'string' ? response : response?.content;
    const parsed = parseAssignmentResponse(text, items.length, existingWaves.length);
    if (parsed) {
      const unmatched = parsed.assignments
        .filter(a => a.wave_index === 0)
        .map(a => a.item_index);
      return { ...parsed, unmatched, method: 'ai' };
    }
  } catch (err) {
    console.warn(`  AI assignment failed: ${err.message}. Using keyword fallback.`);
  }

  // Keyword fallback
  const result = keywordAssign(items, existingWaves);
  const unmatched = result.assignments
    .filter(a => a.wave_index === 0)
    .map(a => a.item_index);
  return { ...result, unmatched, method: 'keyword' };
}

/**
 * Build the LLM prompt to cluster classified intake items into waves.
 * Uses the 3D taxonomy (Application, Aspects, Intent) for smarter grouping.
 * @param {Array<{id: string, title: string, target_application: string, target_aspects: string[], chairman_intent: string}>} items
 * @returns {string}
 */
export function buildClusteringPrompt(items) {
  const itemList = items.map((item, i) =>
    `  ${i + 1}. [${item.target_application}] [${item.chairman_intent}] ${(item.title || '').slice(0, 100)} (aspects: ${(item.target_aspects || []).join(', ')})`
  ).join('\n');

  return `You are grouping classified intake items into execution waves for a strategic roadmap.

Each item has been classified with:
- Application: ehg_engineer (backend/tooling), ehg_app (frontend/UI), or new_venture
- Intent: idea, insight, reference, question, or value
- Aspects: specific areas within the application

Group these ${items.length} items into ${CLUSTER_CONFIG.MIN_WAVES}-${CLUSTER_CONFIG.MAX_WAVES} execution waves.

Items:
${itemList}

Grouping criteria:
- Group by thematic similarity (items about similar aspects/topics together)
- Wave 1 = foundational / infrastructure items
- Later waves = dependent or downstream items
- Keep items from the same application together when possible
- "reference" and "insight" items can be grouped as research waves
- "idea" items that depend on research should come in later waves
- Each wave needs a descriptive title and a one-sentence description
- Every item must be assigned to exactly one wave

Respond with ONLY valid JSON (no markdown, no explanation):
{"waves": [{"title": "<wave title>", "description": "<1 sentence>", "item_indices": [1, 2, 3]}]}`;
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
 * Keyword-based fallback clustering by application + intent.
 * Groups items by application first, then by intent within each app.
 * @param {Array<{id: string, title: string, target_application: string, chairman_intent: string}>} items
 * @returns {{ waves: Array<{title: string, description: string, item_indices: number[]}> }}
 */
export function keywordCluster(items) {
  const waves = [];

  // Group by application
  const byApp = {};
  items.forEach((item, i) => {
    const app = item.target_application || 'unknown';
    if (!byApp[app]) byApp[app] = [];
    byApp[app].push({ ...item, originalIndex: i + 1 });
  });

  const appLabels = {
    ehg_engineer: 'EHG Engineer',
    ehg_app: 'EHG App',
    new_venture: 'New Ventures',
  };

  for (const [app, appItems] of Object.entries(byApp)) {
    // Split references/insights (research) from ideas (build)
    const research = appItems.filter(i =>
      ['reference', 'insight', 'question'].includes(i.chairman_intent)
    );
    const build = appItems.filter(i =>
      ['idea', 'value'].includes(i.chairman_intent)
    );

    const label = appLabels[app] || app;

    if (research.length > 0) {
      waves.push({
        title: `${label}: Research & References`,
        description: `${research.length} research, reference, and insight items for ${label}`,
        item_indices: research.map(i => i.originalIndex),
      });
    }

    if (build.length > 0) {
      waves.push({
        title: `${label}: Ideas & Values`,
        description: `${build.length} ideas and values to evaluate for ${label}`,
        item_indices: build.map(i => i.originalIndex),
      });
    }
  }

  // If we ended up with too many waves, merge small ones
  if (waves.length > CLUSTER_CONFIG.MAX_WAVES) {
    waves.sort((a, b) => b.item_indices.length - a.item_indices.length);
    while (waves.length > CLUSTER_CONFIG.MAX_WAVES) {
      const small = waves.pop();
      waves[waves.length - 1].item_indices.push(...small.item_indices);
      waves[waves.length - 1].description += ` (merged with ${small.title})`;
    }
  }

  return { waves };
}

/**
 * Cluster intake items into waves using AI with keyword fallback.
 * @param {Array<{id: string, title: string, description?: string, target_application?: string, target_aspects?: string[], chairman_intent?: string}>} items
 * @returns {Promise<{ waves: Array<{title: string, description: string, item_indices: number[]}>, method: 'ai' | 'keyword' }>}
 */
export async function clusterItems(items) {
  if (!items || items.length === 0) {
    throw new Error('No items to cluster');
  }

  if (items.length < CLUSTER_CONFIG.MIN_WAVES) {
    return {
      waves: [{ title: 'Wave 1: All Items', description: 'Single wave for small set', item_indices: items.map((_, i) => i + 1) }],
      method: 'keyword',
    };
  }

  // Try AI clustering
  try {
    const client = await getClassificationClient();
    const prompt = buildClusteringPrompt(items);
    let timeoutId;
    const response = await Promise.race([
      client.complete(
        'You are a strategic planning system. Group items into execution waves. Respond with only valid JSON.',
        prompt,
        { maxTokens: 4096 }
      ),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI timeout')), CLUSTER_CONFIG.AI_TIMEOUT_MS);
        if (timeoutId.unref) timeoutId.unref();
      }),
    ]);
    clearTimeout(timeoutId);

    // Adapters return { content: string, ... } — extract the text
    const text = typeof response === 'string' ? response : response?.content;
    const parsed = parseClusteringResponse(text, items.length);
    if (parsed && parsed.waves.length >= CLUSTER_CONFIG.MIN_WAVES) {
      return { ...parsed, method: 'ai' };
    }
  } catch (err) {
    console.warn(`  AI clustering failed: ${err.message}. Using keyword fallback.`);
  }

  return { ...keywordCluster(items), method: 'keyword' };
}

export { CLUSTER_CONFIG };
