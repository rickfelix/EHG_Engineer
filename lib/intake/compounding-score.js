// SD-LEO-INFRA-ESTATE-DISPOSITION-001 (FR-2) — pure 0-3 compounding-score heuristic.
//
// The chairman ratified a LIGHTWEIGHT 0-3 "compounding" judgment captured at disposition time —
// NOT the heavy 4-persona LLM scorer (lib/integrations/refine-score.js) and NOT a capability
// dependency-graph (sd_capabilities is a different namespace with zero edges, explicitly excluded).
// This is a deterministic, no-IO, no-LLM heuristic so it is unit-testable and never fabricated.
//
// The score = sum of three independent 0/1 signals, clamped to [0,3]:
//   - priorityPoint : the item is high/critical priority (more compounding potential).
//   - substancePoint: the item carries a real description (enough to act on, not a one-liner stub).
//   - valuePoint    : the item is a genuine improvement candidate (a promote/convert verdict) OR its
//                     text aligns with the venture/roadmap value vocabulary (revenue/venture/gauge/etc).
// 0 = drop-tier noise; 3 = a substantive, aligned, high-priority improvement candidate.

const PRIORITY_HIGH = new Set(['critical', 'high']);

// Compact value-alignment vocabulary (lowercased substrings). Kept small + readable on purpose —
// this is a heuristic nudge, not a classifier. Tunable.
const VALUE_TERMS = [
  'revenue', 'income', 'venture', 'customer', 'payment', 'gauge', 'vision', 'capability',
  'roadmap', 'automation', 'launch', 'pipeline', 'quit', 'north star', 'compounding', 'leverage',
];

const clamp03 = (n) => Math.max(0, Math.min(3, n | 0));

/**
 * Pure: compute a 0-3 compounding score for an intake item.
 * @param {object} item - normalized intake item { title, description, normalized_priority, ... }
 * @param {object} [ctx] - { verdict } the triage verdict (verdict.promote / verdict.disposition),
 *                         used as the strongest "value" signal when present.
 * @returns {number} integer 0..3
 */
export function computeCompoundingScore(item = {}, ctx = {}) {
  const it = item && typeof item === 'object' ? item : {};
  const verdict = ctx && typeof ctx === 'object' ? (ctx.verdict || {}) : {};

  const priorityPoint = PRIORITY_HIGH.has(String(it.normalized_priority || '').toLowerCase()) ? 1 : 0;

  const desc = typeof it.description === 'string' ? it.description.trim() : '';
  const substancePoint = desc.length >= 40 ? 1 : 0; // a real, actionable description, not a stub

  // A promote/convert verdict is the strongest value signal; otherwise fall back to value-vocab match.
  const isImprovementCandidate = verdict.promote === true || verdict.disposition === 'converted';
  const hay = `${String(it.title || '')} ${desc}`.toLowerCase();
  const aligned = VALUE_TERMS.some((t) => hay.includes(t));
  const valuePoint = (isImprovementCandidate || aligned) ? 1 : 0;

  return clamp03(priorityPoint + substancePoint + valuePoint);
}

export const _internals = { PRIORITY_HIGH, VALUE_TERMS };
