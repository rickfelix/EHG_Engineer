/**
 * Shared frozen contract for the ADKAR change-adoption checklist shape.
 *
 * SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-A / FR-1.
 *
 * ADKAR (Prosci) mapped to the AGENT context (not human emotion): a change flagged
 * metadata.requires_adoption=true must evidence-or-waive each of the 5 stages before it
 * can pass LEAD-FINAL-APPROVAL. See docs/protocol/adkar-change-adoption-framework.md for
 * what each stage means and which existing codebase mechanism already serves it.
 *
 * Imported by BOTH the future completion gate (sibling Child B,
 * lead-final-approval/gates/adkar-adoption-gate.js) and any pilot-tagging work (sibling
 * Child C) so the checklist shape cannot drift across files — mirrors
 * lib/governance/completion-flag-keys.js's shared-frozen-contract pattern.
 *
 * @module lib/governance/adkar-checklist
 */

/** The 5 ADKAR stages, in their canonical order. Frozen — never reorder or rename. */
export const ADKAR_STAGES = Object.freeze(['awareness', 'desire', 'knowledge', 'ability', 'reinforcement']);

/** The SD metadata field names this convention uses. */
export const REQUIRES_ADOPTION_KEY = 'requires_adoption';
export const ADKAR_CHECKLIST_KEY = 'adkar_checklist';

/**
 * Is a single checklist entry valid? Valid iff it names a real ADKAR stage AND carries
 * EITHER real evidence (a non-empty evidence.kind) OR a waiver with a non-empty reason —
 * a waiver with no reason does not satisfy the shape (an empty excuse is not a waiver).
 * @param {{ stage?: string, evidence?: { kind?: string, ref?: string }|null, waived?: boolean, waived_reason?: string|null }} entry
 * @returns {boolean}
 */
export function isValidAdkarEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!ADKAR_STAGES.includes(entry.stage)) return false;
  const hasEvidence = !!(entry.evidence && typeof entry.evidence === 'object'
    && typeof entry.evidence.kind === 'string' && entry.evidence.kind.trim().length > 0);
  const hasWaiver = entry.waived === true
    && typeof entry.waived_reason === 'string' && entry.waived_reason.trim().length > 0;
  return hasEvidence || hasWaiver;
}

/**
 * Validate a full checklist against the 5-stage shape. Pure/synchronous — no DB access,
 * so the future completion gate can call this on an already-fetched SD row.
 * @param {Array<object>} checklist
 * @returns {{ valid: boolean, missingStages: string[], invalidEntries: string[] }}
 */
export function validateAdkarChecklist(checklist) {
  if (!Array.isArray(checklist)) {
    return { valid: false, missingStages: [...ADKAR_STAGES], invalidEntries: [] };
  }
  const byStage = new Map(checklist.filter((e) => e && typeof e === 'object').map((e) => [e.stage, e]));
  const missingStages = ADKAR_STAGES.filter((stage) => !byStage.has(stage));
  const invalidEntries = ADKAR_STAGES.filter((stage) => byStage.has(stage) && !isValidAdkarEntry(byStage.get(stage)));
  return { valid: missingStages.length === 0 && invalidEntries.length === 0, missingStages, invalidEntries };
}
