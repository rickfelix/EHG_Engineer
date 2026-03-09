/**
 * scope-snapshot.js — Scope capture at handoff boundaries & delta computation
 * SD: SD-MAN-INFRA-SEMANTIC-VALIDATION-GATES-002
 *
 * Captures scope state at each handoff and computes delta between snapshots
 * for scope drift detection. Stored in sd_phase_handoffs.scope_snapshot.
 */

import { extractKeywords, keywordsToArray } from './scope-similarity.js';

/**
 * Capture a scope snapshot at the current handoff boundary.
 *
 * @param {object} sd - SD record with scope, title, description, key_changes
 * @returns {object} Snapshot object suitable for JSONB storage
 */
export function captureSnapshot(sd) {
  if (!sd) return null;

  const scopeText = [
    sd.title || '',
    sd.scope || '',
    sd.description || ''
  ].join(' ').trim();

  const keywords = extractKeywords(scopeText);

  return {
    keywords: keywordsToArray(keywords),
    keyword_count: keywords.size,
    scope_text: (sd.scope || '').substring(0, 500),
    timestamp: new Date().toISOString(),
    sd_key: sd.sd_key || sd.id || null
  };
}

/**
 * Compute delta between two scope snapshots.
 * Returns added, removed, and retained keywords.
 *
 * @param {object} before - Previous snapshot
 * @param {object} after - Current snapshot
 * @returns {object} Delta with added, removed, retained arrays and drift score
 */
export function computeDelta(before, after) {
  if (!before || !after) {
    return { added: [], removed: [], retained: [], drift_score: 0, comparable: false };
  }

  const beforeSet = new Set(before.keywords || []);
  const afterSet = new Set(after.keywords || []);

  const added = [...afterSet].filter(k => !beforeSet.has(k));
  const removed = [...beforeSet].filter(k => !afterSet.has(k));
  const retained = [...beforeSet].filter(k => afterSet.has(k));

  // Drift score: 0 = no change, 1 = completely different
  const totalUnique = new Set([...beforeSet, ...afterSet]).size;
  const drift_score = totalUnique > 0 ? (added.length + removed.length) / totalUnique : 0;

  return {
    added,
    removed,
    retained,
    drift_score: Math.round(drift_score * 100) / 100,
    comparable: true,
    summary: `+${added.length} -${removed.length} =${retained.length} (drift: ${Math.round(drift_score * 100)}%)`
  };
}
