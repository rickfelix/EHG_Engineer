/**
 * transition-type — map an internal stage-advancement type to a
 * venture_stage_transitions.transition_type value allowed by the
 * venture_stage_transitions_transition_type_check constraint.
 *
 * SD-FDBK-ENH-VENTURE-STAGE-TRANSITIONS-001: stage-execution-worker._advanceStage
 * previously wrote the literal advancementType (e.g. 'governance_override') into
 * venture_stage_transitions.transition_type, violating the CHECK constraint. Supabase v2
 * returns that error non-fatally, so the advance proceeded but the audit transition row
 * was silently dropped (DataDistill 510177ba missing S15->16, S18->19, S22->23). The
 * precise advancementType is still preserved in venture_stage_work.advisory_data.advancement_type.
 *
 * Pure + dependency-free so it can be unit-tested in isolation.
 */

/** Values permitted by the venture_stage_transitions_transition_type_check constraint. */
export const VALID_TRANSITION_TYPES = ['normal', 'skip', 'rollback', 'pivot'];

/**
 * @param {string} advancementType - internal advance type (normal, governance_override,
 *   auto_approved, re_entry, pre_exec_skip, pre_exec_skip_trigger, s19_bridge_cleared, ...)
 * @returns {'normal'|'skip'|'rollback'|'pivot'} a constraint-valid transition_type
 */
export function toValidTransitionType(advancementType) {
  // governance_override force-advances past a BLOCKED gate — semantically a skip.
  if (advancementType === 'governance_override') return 'skip';
  // An advancementType that is already a valid enum value passes through unchanged.
  if (VALID_TRANSITION_TYPES.includes(advancementType)) return advancementType;
  // Any other internal advancement type maps to 'normal' so the CHECK constraint
  // can never be violated again, even if new advancement types are added.
  return 'normal';
}
