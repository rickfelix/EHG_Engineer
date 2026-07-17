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
 *   - 'already_done'          — A completed SD covers this item
 *   - 'already_institutionalized' — Absorbed by a protocol/role-duty/contract section
 *                                   (SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001, seam 1)
 *   - 'in_progress'           — An active SD is working on this
 *   - 'partially_done'        — Code exists but no SD tracked it
 *   - 'novel'                 — No existing SD or institution matches
 *
 * NON-GOAL (SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001 FR-4, ratified DON'T-build):
 *   Solomon is NEVER wired into per-item reconcile/scoring. Institution matching runs
 *   in the inline Claude-Code semantic path only — no `kind=solomon_consult` seam here.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

// SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001 (FR-2, precision-first / RISK R1): the
// `already_institutionalized` disposition — which EXCLUDES an item from the novel-work
// review queue — requires a STRICTLY HIGHER confidence than `already_done` AND a
// verifiable section pointer. A weak (60-84) or pointerless match degrades to `novel`
// (fail-open to surfacing) and is NEVER silently suppressed. Excluding a genuinely-novel
// item is far worse than an institutionalized item mildly padding the queue.
export const INSTITUTION_CONFIDENCE_FLOOR = 85;

/**
 * Precision guard for the `already_institutionalized` disposition (pure; no I/O).
 * Enforces the floor + pointer discipline on a single reconcile result, degrading to
 * `novel` with an `institution_note` when the evidence is too weak to justify excluding
 * the item from the chairman review queue. Applied to inline-semantic results before they
 * are persisted or gate the enqueue. Token-mode never emits the disposition, so this is a
 * no-op there.
 * @param {Object} result - { item_index, status, matched_sd_key?, matched_section_id?,
 *                            matched_section_title?, confidence }
 * @returns {Object} the same result, or a downgraded { status:'novel', institution_note }
 */
export function enforceInstitutionDiscipline(result) {
  if (!result || result.status !== 'already_institutionalized') return result;
  const confidence = Number(result.confidence) || 0;
  const hasPointer = typeof result.matched_section_id === 'string' && result.matched_section_id.length > 0;
  if (confidence >= INSTITUTION_CONFIDENCE_FLOOR && hasPointer) return result;
  // Too weak / pointerless — SURFACE it (never suppress), annotated with what was seen.
  return {
    ...result,
    status: 'novel',
    institution_note: {
      downgraded_from: 'already_institutionalized',
      reason: hasPointer ? `confidence ${confidence} < floor ${INSTITUTION_CONFIDENCE_FLOOR}` : 'no resolvable section pointer',
      candidate_section_id: result.matched_section_id || null,
      candidate_section_title: result.matched_section_title || null,
      confidence,
    },
  };
}

/**
 * Load the institution corpus — protocol/role-duty/contract sections that may already
 * absorb an intake item's intent. SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001 (FR-1).
 * Fail-open: a load error yields [] so reconcile degrades to SD-only matching.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{id: string, title: string, section_type: string, anchor_topic: string, content: string}>>}
 */
async function loadProtocolSections(supabase) {
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, section_type, anchor_topic, content')
    .order('id', { ascending: true })
    .limit(400);
  if (error) {
    console.warn(`  Warning: protocol-section query error (SD-only reconcile): ${error.message}`);
    return [];
  }
  return data || [];
}

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
  // SD-LEO-INFRA-DISTILL-REFINE-RECONCILE-001 (FR-1): also load the institution corpus so
  // the inline analyzer can match items already absorbed as a protocol/role duty. Loaded
  // ONCE per run (RISK R3), inline-semantic only (RISK R2: no token index over prose).
  const sections = await loadProtocolSections(supabase);
  const sectionSummaries = sections.map(s => ({
    section_id: String(s.id),
    title: (s.title || '').slice(0, 160),
    section_type: s.section_type || '',
    anchor_topic: s.anchor_topic || '',
    excerpt: (s.content || '').slice(0, 240),
  }));

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
    instruction: `Semantically match each wave item against BOTH the existing SDs and the
protocol/role-duty/contract SECTIONS below.
For each item, determine:
  - "novel" — No existing SD or institution section covers this idea
  - "already_done" — A completed SD already delivered this capability
  - "already_institutionalized" — The intent is already an institutional duty: a role
      contract, protocol clause, or standing responsibility captured in a SECTION below
      (e.g. an item "run a deep architecture review" when a role contract already lists
      "deep architecture review" as a standing duty). This EXCLUDES the item from the
      novel-work queue, so it demands STRONGER evidence than "already_done".
  - "in_progress" — An active/in-progress SD is working on this
  - "partially_done" — An SD partially covers this (different scope or incomplete)

Rules:
  - Match on MEANING, not just keywords. "Add dark mode" matches "Implement theme switching".
  - Short/vague items (e.g., "script", "Next Steps") with no clear semantic match should be "novel".
  - Confidence 0-100: how certain the match is (100 = exact same scope, 50 = partial overlap).
  - Only flag "already_done"/"in_progress"/"partially_done" if confidence >= 60.
  - PRECISION-FIRST for "already_institutionalized": flag it ONLY at confidence >= ${INSTITUTION_CONFIDENCE_FLOOR}
    AND set matched_section_id to the specific section. If you are not that sure, or you
    cannot name the section, choose "novel" — excluding a genuinely-new item from review
    is far worse than surfacing a duplicate. When institutionalized, ALSO include a short
    matched_section_title so a human can verify the absorption.
  - When matching SDs, consider the SD's key_changes for specificity, not just the title.

Respond with JSON:
{
  "results": [
    {"item_index": 1, "status": "novel", "matched_sd_key": null, "matched_sd_title": null, "matched_section_id": null, "matched_section_title": null, "confidence": 0},
    {"item_index": 2, "status": "already_done", "matched_sd_key": "SD-XXX-001", "matched_sd_title": "...", "matched_section_id": null, "matched_section_title": null, "confidence": 85},
    {"item_index": 3, "status": "already_institutionalized", "matched_sd_key": null, "matched_sd_title": null, "matched_section_id": "611", "matched_section_title": "Solomon Role Contract", "confidence": 90}
  ]
}

Every item must have exactly one result. Item indices are 1-based.`,
    sds: sdSummaries,
    sections: sectionSummaries,
    items: itemSummaries,
    item_count: items.length,
    sd_count: sdSummaries.length,
    section_count: sectionSummaries.length,
    institution_confidence_floor: INSTITUTION_CONFIDENCE_FLOOR,
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
