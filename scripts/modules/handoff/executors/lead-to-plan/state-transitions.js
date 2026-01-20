/**
 * State Transitions for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * Gap #7 Fix (2026-01-01): LeadToPlanExecutor was missing state transition.
 * SD remained in LEAD phase even after handoff was approved.
 */

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
    // Determine the correct SD ID field (UUID vs legacy_id)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'legacy_id';

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
