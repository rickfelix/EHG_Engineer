/**
 * Effort recommendation by work class — SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-5).
 *
 * Measured basis (SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001 readout 2026-06-11):
 * medium matched xhigh per-worker handoff throughput (3.29 vs 3.23/worker-hr) and ran
 * ~3x cheaper on small well-specified items, with mildly elevated real rejections
 * (14% vs 9%, n=48). So: QFs and tightly-specified single-concern SDs → 'medium';
 * multi-gate / ambiguous / architectural work → 'xhigh'. ADVISORY ONLY — surfaced in
 * WORK_ASSIGNMENT payloads and the worker check-in result; workers/operator override
 * freely; nothing gates on it.
 *
 * Pure classifier: work item in, recommendation out. No DB access.
 *
 * @module lib/fleet/effort-recommendation
 */

const AMBIGUITY_KEYWORDS = [
  'architecture', 'architectural', 'refactor', 'redesign', 'migration', 'migrate',
  'orchestrat', 'decompos', 'consolidat', 'investigate', 'explore', 'research',
  'ambiguous', 'review', 'audit', 'security', 'hardening',
];

/**
 * Recommend an effort tier for a work item.
 *
 * @param {{
 *   kind?: 'qf'|'sd',
 *   sd_type?: string,
 *   title?: string,
 *   description?: string,
 *   fr_count?: number,
 *   loc_estimate?: number
 * }} item Work item facts. `kind:'qf'` for quick-fixes; SDs pass sd_type/title/fr_count.
 * @returns {{effort: 'medium'|'xhigh', reason: string}}
 */
function recommendEffort(item = {}) {
  // QFs are by definition small and tightly specified (<=50 LOC, single concern).
  if (item.kind === 'qf' || /^QF-/.test(item.title || '')) {
    return { effort: 'medium', reason: 'quick-fix: small, tightly specified' };
  }

  // Orchestrator parents coordinate children — always full reasoning depth.
  if ((item.sd_type || '').toLowerCase() === 'orchestrator') {
    return { effort: 'xhigh', reason: 'orchestrator parent' };
  }

  // Multi-FR scope means multiple gates and integration surfaces.
  if (Number(item.fr_count) >= 3) {
    return { effort: 'xhigh', reason: `multi-FR scope (${item.fr_count} FRs)` };
  }

  // Ambiguity/architecture keywords in title or description.
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  const hit = AMBIGUITY_KEYWORDS.find((k) => text.includes(k));
  if (hit) {
    return { effort: 'xhigh', reason: `ambiguous/architectural keyword: ${hit}` };
  }

  // Small, tightly specified SD (explicit LOC estimate within QF-ish range).
  if (Number(item.loc_estimate) > 0 && Number(item.loc_estimate) <= 100) {
    return { effort: 'medium', reason: `small well-specified scope (~${item.loc_estimate} LOC)` };
  }

  // Default conservative: unknown scope gets full depth.
  return { effort: 'xhigh', reason: 'default: scope not provably small/tight' };
}

module.exports = { recommendEffort, AMBIGUITY_KEYWORDS };
