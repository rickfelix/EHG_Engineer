/**
 * EVA Idea Dedup Checker
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D
 *
 * Detects duplicate ideas using Jaccard similarity on title tokens.
 * Threshold: 0.7 (configurable).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_THRESHOLD = 0.7;

/**
 * Tokenize text into normalized words
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2) // Skip short words
  );
}

/**
 * Compute Jaccard similarity between two sets
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} 0-1 similarity score
 */
function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

/**
 * Check if an idea is a duplicate of existing items
 * @param {string} title - New item title
 * @param {Object} [options]
 * @param {number} [options.threshold=0.7] - Similarity threshold
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @param {string} [options.sourceType] - 'todoist' or 'youtube' (checks both if omitted)
 * @param {string} [options.excludeId] - ID to exclude from results (the item being evaluated)
 * @returns {Promise<{isDuplicate: boolean, matches: Array, bestMatch: Object|null}>}
 */
export async function checkDuplicate(title, options = {}) {
  const threshold = options.threshold || DEFAULT_THRESHOLD;
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const newTokens = tokenize(title);
  const matches = [];

  // Check Todoist intake
  if (!options.sourceType || options.sourceType !== 'youtube') {
    let query = supabase
      .from('eva_todoist_intake')
      .select('id, title, status')
      .neq('status', 'error');
    if (options.excludeId) query = query.neq('id', options.excludeId);
    const { data: todoistItems } = await query;

    for (const item of todoistItems || []) {
      const similarity = jaccardSimilarity(newTokens, tokenize(item.title));
      if (similarity >= threshold) {
        matches.push({ source: 'todoist', id: item.id, title: item.title, similarity, status: item.status });
      }
    }
  }

  // Check YouTube intake
  if (!options.sourceType || options.sourceType !== 'todoist') {
    let query = supabase
      .from('eva_youtube_intake')
      .select('id, title, status')
      .neq('status', 'error');
    if (options.excludeId) query = query.neq('id', options.excludeId);
    const { data: youtubeItems } = await query;

    for (const item of youtubeItems || []) {
      const similarity = jaccardSimilarity(newTokens, tokenize(item.title));
      if (similarity >= threshold) {
        matches.push({ source: 'youtube', id: item.id, title: item.title, similarity, status: item.status });
      }
    }
  }

  // Check existing feedback items too
  const { data: feedbackItems } = await supabase
    .from('feedback')
    .select('id, title, status')
    .in('source_type', ['todoist_intake', 'youtube_intake', 'manual_feedback']);

  for (const item of feedbackItems || []) {
    const similarity = jaccardSimilarity(newTokens, tokenize(item.title));
    if (similarity >= threshold) {
      matches.push({ source: 'feedback', id: item.id, title: item.title, similarity, status: item.status });
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.similarity - a.similarity);

  return {
    isDuplicate: matches.length > 0,
    matches,
    bestMatch: matches[0] || null
  };
}

// Export Jaccard for testing
export { jaccardSimilarity, tokenize };

export default { checkDuplicate, jaccardSimilarity, tokenize };
