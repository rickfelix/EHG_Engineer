/**
 * Shared provenance definitions for sub_agent_execution_results writers and readers.
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A.
 *
 * No SSOT for reading/grading this table's provenance existed before this module — each reader
 * (subagent-evidence-gate.js, activation-invariant-gate.js, acceptance-tier-downgrade-gate.js)
 * hand-rolled its own query and verdict logic (acceptance-tier-downgrade-gate.js's own header
 * admits mirroring activation-invariant-gate.js's query shape by hand). This module centralizes
 * the definition so a future third reader imports it instead of hand-rolling a fourth copy.
 *
 * PROVENANCE FIELDS graded: source (top-level column), invocation_id (top-level column),
 * metadata.session_id (child E, merged), metadata.content_hash (this child). A row missing any
 * of the four is graded ABSENT — not weak — per ratification 6c263823.
 */

import crypto from 'node:crypto';

/** Deterministic stringify — recursive sorted keys, stable across key order. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/**
 * Hash of a row's substantive payload — not its provenance fields themselves — so a reader can
 * RE-DERIVE the hash from a row's own content and compare it against what the writer stamped,
 * catching a row whose content was altered post-write without recomputing the hash.
 */
export function computeContentHash(payload) {
  const canonical = {
    verdict: payload?.verdict ?? null,
    confidence: payload?.confidence ?? null,
    critical_issues: payload?.critical_issues ?? [],
    warnings: payload?.warnings ?? [],
    recommendations: payload?.recommendations ?? [],
    detailed_analysis: payload?.detailed_analysis ?? null,
    summary: payload?.summary ?? null,
  };
  return crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

/**
 * Producer identities that count as a real runner, never a caller's own unaudited claim.
 * 'manual' is DELIBERATELY excluded — it is the sub_agent_execution_results.source column's own
 * DB DEFAULT, the exact value this SD's own measurement found on 185 of 200 sampled rows because
 * results-storage.js never set it, not a producer's own asserted identity.
 */
export const PRODUCER_ALLOWLIST = ['sub_agent_executor', 'task_hook'];

/**
 * Splits rows into pre-cutover (graded under the pre-existing, lenient rule) and post-cutover
 * (must carry all four provenance fields). Set EARLY relative to this child's merge deliberately:
 * an early cutover only costs a few extra rows briefly graded leniently, while a late one would
 * wrongly strict-grade rows that already existed before this child's writer change landed.
 */
export const PROVENANCE_CUTOVER_AT = '2026-09-05T04:30:00.000Z';

/**
 * Maps every observed sub_agent_execution_results.phase spelling (measured live, 12 distinct
 * non-null spellings across the newest 40 rows) to the phase whose WORK a row belongs to.
 * Handoff-name-shaped spellings (e.g. EXEC_TO_PLAN, PLAN_TO_EXEC) are mapped to the phase that
 * handoff verifies, not the phase it transitions INTO — a row phase-labeled EXEC_TO_PLAN was
 * produced verifying EXEC's output, so it belongs to EXEC. 'orchestrated' and any unlisted
 * spelling are deliberately left unmapped (null).
 *
 * NOT A DEDUP KEY — DO NOT reuse this bucket for write-time deduplication or skip decisions.
 * phase-token.js (SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001) deliberately does NOT bucket to
 * LEAD/PLAN/EXEC for exactly that reason: a coarse bucket collapsing PLAN_PRD and
 * PLAN_VERIFICATION together previously froze created_at by treating a genuinely new sub-phase
 * write as a duplicate of an older one (fb 0b12ca77). This module's bucket exists ONLY for
 * READ-TIME gate relevance/window-scoping (does this row's phase belong to the phase a handoff is
 * currently verifying) — a coarser question than write identity, and safe to answer coarsely.
 */
const PHASE_MAP = {
  LEAD: 'LEAD',
  LEAD_TO_PLAN: 'LEAD',
  'LEAD-TO-PLAN': 'LEAD',
  LEAD_FINAL: 'LEAD',
  PLAN: 'PLAN',
  PLAN_TO_EXEC: 'PLAN',
  'PLAN-TO-EXEC': 'PLAN',
  PLAN_TO_LEAD: 'PLAN',
  'PLAN-TO-LEAD': 'PLAN',
  PLAN_VERIFICATION: 'PLAN',
  PLAN_PRD: 'PLAN',
  EXEC: 'EXEC',
  EXEC_TO_PLAN: 'EXEC',
  'EXEC-TO-PLAN': 'EXEC',
  EXEC_IMPLEMENTATION: 'EXEC',
};

/** @returns {'LEAD'|'PLAN'|'EXEC'|null} */
export function normalisePhase(phase) {
  if (phase == null) return null;
  return PHASE_MAP[phase] ?? null;
}

/**
 * The phase whose work a given handoff type verifies — e.g. EXEC-TO-PLAN checks evidence
 * produced DURING EXEC, so its expected phase is EXEC, not PLAN (the phase it transitions into).
 * Covers the 4 handoff types subagent-evidence-gate.js is wired into, plus LEAD-FINAL-APPROVAL
 * (SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D2) -- LEAD-FINAL-APPROVAL verifies the LEAD-phase
 * completion record, matching subagent-evidence-gate.js's own phase-start resolver, which already
 * answers 'LEAD' for this handoff type.
 */
export const HANDOFF_TYPE_TO_PHASE = {
  'LEAD-TO-PLAN': 'LEAD',
  'PLAN-TO-EXEC': 'PLAN',
  'EXEC-TO-PLAN': 'EXEC',
  'PLAN-TO-LEAD': 'PLAN',
  'LEAD-FINAL-APPROVAL': 'LEAD',
};

/**
 * Grade one sub_agent_execution_results row for provenance.
 *
 * @param {object} row — must carry created_at, source, invocation_id, verdict, confidence,
 *   critical_issues, warnings, recommendations, detailed_analysis, summary, phase, and a metadata
 *   object with session_id/content_hash (as read via the reader's own select, e.g.
 *   session_id:metadata->>session_id).
 * @param {{expectedPhase?: string|null}} [opts] — when provided, a post-cutover row whose
 *   normalised phase does not match is also graded ABSENT (window-scoping).
 * @returns {{absent: boolean, preCutover: boolean, missingField?: string}}
 */
export function gradeProvenance(row, { expectedPhase } = {}) {
  const createdAt = row?.created_at ? Date.parse(row.created_at) : NaN;
  const isPreCutover = Number.isFinite(createdAt) && createdAt < Date.parse(PROVENANCE_CUTOVER_AT);
  if (isPreCutover) return { absent: false, preCutover: true };

  if (!row?.source || !PRODUCER_ALLOWLIST.includes(row.source)) {
    return { absent: true, preCutover: false, missingField: 'source' };
  }
  if (!row?.invocation_id) {
    return { absent: true, preCutover: false, missingField: 'invocation_id' };
  }
  if (!row?.session_id) {
    return { absent: true, preCutover: false, missingField: 'session_id' };
  }
  const contentHash = row?.content_hash;
  if (!contentHash) {
    return { absent: true, preCutover: false, missingField: 'content_hash' };
  }
  const recomputed = computeContentHash(row);
  if (recomputed !== contentHash) {
    return { absent: true, preCutover: false, missingField: 'content_hash_mismatch' };
  }
  if (expectedPhase !== undefined) {
    const rowPhase = normalisePhase(row.phase);
    if (rowPhase == null || rowPhase !== expectedPhase) {
      return { absent: true, preCutover: false, missingField: 'phase' };
    }
  }
  return { absent: false, preCutover: false };
}
