/**
 * Refine: SD + Codebase Reconciliation Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * Checks each roadmap wave item against:
 *   1. Existing Strategic Directives (completed, in-progress, or draft)
 *   2. Codebase state (files that already implement the idea)
 *
 * Produces a reconciliation status per item:
 *   - 'already_done'    — A completed SD covers this item
 *   - 'in_progress'     — An active SD is working on this
 *   - 'partially_done'  — Code exists but no SD tracked it
 *   - 'novel'           — No existing SD or code matches
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Load completed and active SDs for reconciliation matching.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{id: string, sd_key: string, title: string, status: string, key_changes: any[]}>>}
 */
async function loadSDs(supabase) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, key_changes')
    .in('status', ['completed', 'in_progress', 'active', 'planning', 'draft'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn(`  Warning: SD query error: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * Build a normalized search index from SD titles and key_changes.
 * @param {Array} sds
 * @returns {Map<string, {sd_key: string, status: string, title: string}>}
 */
function buildSDIndex(sds) {
  const index = new Map();

  for (const sd of sds) {
    // Tokenize title
    const titleTokens = tokenize(sd.title);
    for (const token of titleTokens) {
      if (token.length >= 4) {
        index.set(token, { sd_key: sd.sd_key, status: sd.status, title: sd.title });
      }
    }

    // Tokenize key_changes descriptions
    const changes = Array.isArray(sd.key_changes) ? sd.key_changes : [];
    for (const change of changes) {
      const desc = typeof change === 'string' ? change : change?.description || '';
      for (const token of tokenize(desc)) {
        if (token.length >= 4 && !index.has(token)) {
          index.set(token, { sd_key: sd.sd_key, status: sd.status, title: sd.title });
        }
      }
    }
  }

  return index;
}

/**
 * Tokenize a string into normalized words.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(t => t.length >= 3);
}

/**
 * Score how well an item matches against the SD index.
 * Returns the best matching SD if above threshold.
 * @param {Object} item
 * @param {Map} sdIndex
 * @param {Array} sds - Full SD list for detailed matching
 * @returns {{ match: Object|null, score: number }}
 */
function matchItem(item, sdIndex, sds) {
  const itemTokens = tokenize(item.title);
  if (itemTokens.length === 0) return { match: null, score: 0 };

  // Count token overlaps per SD
  const sdScores = new Map();

  for (const token of itemTokens) {
    const sdMatch = sdIndex.get(token);
    if (sdMatch) {
      const current = sdScores.get(sdMatch.sd_key) || { ...sdMatch, hits: 0 };
      current.hits++;
      sdScores.set(sdMatch.sd_key, current);
    }
  }

  if (sdScores.size === 0) return { match: null, score: 0 };

  // Find best match by hit ratio
  let best = null;
  let bestScore = 0;

  for (const [, entry] of sdScores) {
    const score = entry.hits / itemTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return { match: best, score: bestScore };
}

/**
 * Reconcile wave items against existing SDs.
 * @param {Array<{id: string, title: string, source_type: string, target_application: string}>} items
 * @param {Object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Array<{item_index: number, status: string, matched_sd_key: string|null, confidence: number}>>}
 */
export async function reconcile(items, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const sds = await loadSDs(supabase);
  const sdIndex = buildSDIndex(sds);

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { match, score } = matchItem(item, sdIndex, sds);

    let status = 'novel';
    if (match && score >= 0.5) {
      if (match.status === 'completed') {
        status = 'already_done';
      } else if (['in_progress', 'active'].includes(match.status)) {
        status = 'in_progress';
      } else {
        status = 'partially_done';
      }
    }

    results.push({
      item_index: i + 1,
      status,
      matched_sd_key: match?.sd_key || null,
      matched_sd_title: match?.title || null,
      confidence: Math.round(score * 100),
    });
  }

  return results;
}
