/**
 * State Transitions for PLAN-TO-EXEC Handoff
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Root cause fix: Handoffs should act as state machine transitions, not just validation gates
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Added rollback support
 */

/**
 * Capture current SD + PRD state for rollback on handoff failure
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Defensive rollback
 */
export function captureStateSnapshot(sd, prd) {
  return {
    sd_phase: sd?.current_phase || 'PLAN_PRD',
    sd_status: sd?.status || 'planning',
    sd_is_working_on: sd?.is_working_on || false,
    prd_status: prd?.status || 'approved',
    prd_phase: prd?.phase || null,
    captured_at: new Date().toISOString()
  };
}

/**
 * Rollback SD + PRD state to pre-transition snapshot
 * SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001
 */
export async function rollbackState(supabase, sdId, prd, snapshot) {
  console.log('\n⚠️  STATE ROLLBACK: Reverting SD and PRD phase/status');
  console.log('-'.repeat(50));
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'sd_key';
    const { error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: snapshot.sd_phase,
        status: snapshot.sd_status,
        is_working_on: snapshot.sd_is_working_on,
        updated_at: new Date().toISOString()
      })
      .eq(queryField, sdId);
    if (sdErr) console.log(`   ❌ SD rollback failed: ${sdErr.message}`);
    else console.log(`   ✅ SD rolled back to phase=${snapshot.sd_phase}, status=${snapshot.sd_status}`);

    if (prd) {
      const { error: prdErr } = await supabase
        .from('product_requirements_v2')
        .update({ status: snapshot.prd_status, phase: snapshot.prd_phase, updated_at: new Date().toISOString() })
        .eq('id', prd.id);
      if (prdErr) console.log(`   ❌ PRD rollback failed: ${prdErr.message}`);
      else console.log(`   ✅ PRD rolled back to status=${snapshot.prd_status}`);
    }
  } catch (error) {
    console.log(`   ❌ Rollback error: ${error.message}`);
  }
}

/**
 * Transition PRD status to EXEC phase
 *
 * Root cause fix: Handoffs were designed as validation gates (check state) but not
 * state machine transitions (update state). This caused PRD status to remain stale,
 * blocking downstream handoffs that depend on PRD status.
 *
 * 5 Whys Analysis: See SD-QA-STAGES-21-25-001 retrospective
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} prd - PRD object
 * @param {string} _sdId - SD ID (unused, for logging)
 */
export async function transitionPrdToExec(supabase, prd, _sdId) {
  if (!prd) {
    console.log('\n   ⚠️  No PRD to transition');
    return;
  }

  console.log('\n📊 STATE TRANSITION: PRD Status Update');
  console.log('-'.repeat(50));

  try {
    // QF-20251220-860: Use valid status 'in_progress' instead of 'ready_for_exec'
    // Valid statuses: approved, completed, draft, in_progress, planning
    const { error } = await supabase
      .from('product_requirements_v2')
      .update({
        status: 'in_progress',
        phase: 'exec',
        updated_at: new Date().toISOString()
      })
      .eq('id', prd.id);

    if (error) {
      // QF-20251220-860: Make status update failure blocking instead of silent warning
      console.error(`   ❌ BLOCKING: Could not update PRD status: ${error.message}`);
      throw new Error(`PRD status update failed: ${error.message}. Cannot proceed with inconsistent state.`);
    } else {
      console.log('   ✅ PRD status transitioned: approved → in_progress');
      console.log('   ✅ PRD phase transitioned: → exec');
    }
  } catch (error) {
    console.error(`   ❌ PRD transition error: ${error.message}`);
    throw error; // Re-throw to block handoff
  }
}

/**
 * Transition SD phase to EXEC
 *
 * Root cause fix: When handoff was approved, SD current_phase remained at 'PLAN'
 * even though PRD was transitioned. This caused phase tracking to be out of sync
 * and blocked downstream processes that check SD phase.
 *
 * SYSTEMIC FIX: SD state machine now transitions alongside PRD state machine.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} sd - Strategic Directive object
 */
export async function transitionSdToExec(supabase, sdId, sd) {
  console.log('\n📊 STATE TRANSITION: SD Phase Update');
  console.log('-'.repeat(50));

  try {
    // Determine the correct SD ID field (UUID vs sd_key)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'sd_key';

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'EXEC',
        status: 'active',
        is_working_on: true,
        updated_at: new Date().toISOString()
      })
      .eq(queryField, sdId);

    if (error) {
      console.log(`   ⚠️  Could not update SD phase: ${error.message}`);
    } else {
      const oldPhase = sd?.current_phase || 'PLAN';
      console.log(`   ✅ SD phase transitioned: ${oldPhase} → EXEC`);
      console.log('   ✅ SD status transitioned: → active');
      console.log('   ✅ SD marked as working_on: true');
    }
  } catch (error) {
    console.log(`   ⚠️  SD transition error: ${error.message}`);
  }
}
