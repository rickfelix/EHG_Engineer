/**
 * Refine: SD + Codebase Reconciliation Engine
 * SD: SD-LEO-INFRA-ADD-DISTILL-REFINE-001
 *
 * Checks each roadmap wave item against:
 *   1. Existing Strategic Directives (completed, in-progress, or draft)
 *   2. Codebase state (files that already implement the idea)
 *
 * Two modes:
 *   - **Inline** (default): Extracts context for Claude Code to analyze semantically
 *   - **Token**: Fast keyword-overlap fallback (standalone script use)
 *
 * Produces a reconciliation status per item:
 *   - 'already_done'    — A completed SD covers this item
 *   - 'in_progress'     — An active SD is working on this
 *   - 'partially_done'  — Code exists but no SD tracked it
 *   - 'novel'           — No existing SD or code matches
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
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

// ─── Inline Mode: Extract context for Claude Code ──────────

/**
 * Extract reconciliation context for Claude Code inline analysis.
 * Loads SDs from DB and formats them alongside wave items for semantic matching.
 *
 * @param {Array} items - Wave items to reconcile
 * @param {Object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Context object for Claude Code to analyze
 */
export async function extractReconcileContext(items, options = {}) {
  const supabase = options.supabase || createSupabaseServiceClient();

  const sds = await loadSDs(supabase);

  // Compact SD summaries for context efficiency
  const sdSummaries = sds.map(sd => {
    const changes = Array.isArray(sd.key_changes) ? sd.key_changes : [];
    const changeDescs = changes
      .map(c => (typeof c === 'string' ? c : c?.description || ''))
      .filter(Boolean)
      .slice(0, 5)
      .map(d => d.slice(0, 120));

    return {
      sd_key: sd.sd_key,
      status: sd.status,
      title: sd.title,
      key_changes: changeDescs,
    };
  });

  // Compact item summaries
  const itemSummaries = items.map((item, i) => ({
    index: i + 1,
    title: (item.title || '(untitled)').slice(0, 200),
    description: (item.description || '').slice(0, 200),
    target_application: item.target_application || '',
    chairman_intent: item.chairman_intent || '',
  }));

  return {
    mode: 'RECONCILE_CONTEXT',
    instruction: `Semantically match each wave item against the existing SDs below.
For each item, determine:
  - "novel" — No existing SD covers this idea
  - "already_done" — A completed SD already delivered this capability
  - "in_progress" — An active/in-progress SD is working on this
  - "partially_done" — An SD partially covers this (different scope or incomplete)

Rules:
  - Match on MEANING, not just keywords. "Add dark mode" matches "Implement theme switching".
  - Short/vague items (e.g., "script", "Next Steps") with no clear semantic match should be "novel".
  - Confidence 0-100: how certain the match is (100 = exact same scope, 50 = partial overlap).
  - Only flag non-novel if confidence >= 60.
  - When matching, consider the SD's key_changes for specificity, not just the title.

Respond with JSON:
{
  "results": [
    {"item_index": 1, "status": "novel", "matched_sd_key": null, "matched_sd_title": null, "confidence": 0},
    {"item_index": 2, "status": "already_done", "matched_sd_key": "SD-XXX-001", "matched_sd_title": "...", "confidence": 85}
  ]
}

Every item must have exactly one result. Item indices are 1-based.`,
    sds: sdSummaries,
    items: itemSummaries,
    item_count: items.length,
    sd_count: sdSummaries.length,
  };
}

// ─── Token Mode: Fast keyword-overlap fallback ─────────────

/**
 * Build a normalized search index from SD titles and key_changes.
 * @param {Array} sds
 * @returns {Map<string, {sd_key: string, status: string, title: string}>}
 */
function buildSDIndex(sds) {
  const index = new Map();

  for (const sd of sds) {
    const titleTokens = tokenize(sd.title);
    for (const token of titleTokens) {
      if (token.length >= 4) {
        index.set(token, { sd_key: sd.sd_key, status: sd.status, title: sd.title });
      }
    }

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
 * @param {Object} item
 * @param {Map} sdIndex
 * @returns {{ match: Object|null, score: number }}
 */
function matchItem(item, sdIndex) {
  const itemTokens = tokenize(item.title);
  if (itemTokens.length === 0) return { match: null, score: 0 };

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
 * Token-based reconciliation (fast keyword fallback).
 * Used when running standalone or when Claude Code inline is unavailable.
 * @param {Array} items
 * @param {Object} [options]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Array<{item_index: number, status: string, matched_sd_key: string|null, confidence: number}>>}
 */
export async function tokenReconcile(items, options = {}) {
  const supabase = options.supabase || createSupabaseServiceClient();

  const sds = await loadSDs(supabase);
  const sdIndex = buildSDIndex(sds);

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { match, score } = matchItem(item, sdIndex);

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

// Default export: tokenReconcile for backward compat when running standalone
export { tokenReconcile as reconcile };
