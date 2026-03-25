/**
 * State Transitions for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * Gap #7 Fix (2026-01-01): LeadToPlanExecutor was missing state transition.
 * SD remained in LEAD phase even after handoff was approved.
 */

/**
 * Capture current SD state for rollback on handoff failure
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Defensive rollback
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Snapshot of phase/status before transition
 */
export function captureStateSnapshot(sd) {
  return {
    current_phase: sd?.current_phase || 'LEAD',
    status: sd?.status || 'draft',
    captured_at: new Date().toISOString()
  };
}

/**
 * Rollback SD state to pre-transition snapshot
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Called when handoff record creation fails
 *
 * @param {string} sdId - SD ID
 * @param {Object} snapshot - State snapshot from captureStateSnapshot()
 * @param {Object} supabase - Supabase client
 */
export async function rollbackSdState(sdId, snapshot, supabase) {
  console.log('\n⚠️  STATE ROLLBACK: Reverting SD phase/status');
  console.log('-'.repeat(50));
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'sd_key';
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: snapshot.current_phase,
        status: snapshot.status,
        updated_at: new Date().toISOString()
      })
      .eq(queryField, sdId);
    if (error) {
      console.log(`   ❌ Rollback failed: ${error.message}`);
    } else {
      console.log(`   ✅ Rolled back to phase=${snapshot.current_phase}, status=${snapshot.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Rollback error: ${error.message}`);
  }
}

/**
 * STATE TRANSITION: Update SD current_phase on successful LEAD-TO-PLAN handoff
 *
 * @param {string} sdId - SD ID
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 */
export async function transitionSdToPlan(sdId, sd, supabase) {
  console.log('\n📊 STATE TRANSITION: SD Phase Update');
  console.log('-'.repeat(50));

  try {
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Query by id or sd_key (legacy_id removed 2026-01-24)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'sd_key';

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'PLAN_PRD',
        status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq(queryField, sdId);

    if (error) {
      console.log(`   ⚠️  Could not update SD phase: ${error.message}`);
    } else {
      const oldPhase = sd?.current_phase || 'LEAD';
      console.log(`   ✅ SD phase transitioned: ${oldPhase} → PLAN_PRD`);
      console.log('   ✅ SD status transitioned: → in_progress');
    }
  } catch (error) {
    console.log(`   ⚠️  SD transition error: ${error.message}`);
  }
}
