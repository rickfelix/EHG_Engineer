/**
 * Preflight Checks for Gate 3 (PLAN→LEAD)
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 *
 * Phase 1: Non-Negotiable Blockers
 */

/**
 * Run preflight checks for Gate 3
 * @param {string} sdUuid - Resolved SD UUID
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{passed: boolean, gate2Data: Object|null}>}
 */
export async function runPreflightChecks(sdUuid, validation, supabase) {
  console.log('\n[PHASE 1] Non-Negotiable Blockers...');
  console.log('-'.repeat(60));

  try {
    // Verify Gate 2 (EXEC→PLAN) passed
    const { data: gate2Handoff } = await supabase
      .from('sd_phase_handoffs')
      .select('metadata')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!gate2Handoff || gate2Handoff.length === 0) {
      validation.issues.push('[PHASE 1] CRITICAL: Gate 2 (EXEC→PLAN) handoff not found');
      validation.failed_gates.push('GATE2_HANDOFF');
      validation.passed = false;
      console.log('   FAIL Gate 2 handoff not found - BLOCKING');
      console.log('   Warning EXEC must complete EXEC→PLAN handoff before Gate 3');
      console.log('='.repeat(60));
      return { passed: false, gate2Data: null };
    }

    const gate2Validation = gate2Handoff[0].metadata?.gate2_validation;
    if (!gate2Validation || !gate2Validation.passed) {
      validation.issues.push('[PHASE 1] CRITICAL: Gate 2 validation failed - cannot proceed to Gate 3');
      validation.failed_gates.push('GATE2_FAILED');
      validation.passed = false;
      console.log('   FAIL Gate 2 failed - BLOCKING');
      console.log(`   Warning Gate 2 score: ${gate2Validation?.score || 'unknown'}/${gate2Validation?.max_score || 100}`);
      console.log('   Warning Fix Gate 2 issues before proceeding to Gate 3');
      console.log('='.repeat(60));
      return { passed: false, gate2Data: gate2Validation };
    }

    console.log(`   OK Gate 2 passed (${gate2Validation.score}/${gate2Validation.max_score})`);
    console.log('   OK All Phase 1 blockers passed - proceeding to Phase 2 scoring');

    return { passed: true, gate2Data: gate2Validation };
  } catch (error) {
    validation.issues.push(`[PHASE 1] Error during preflight checks: ${error.message}`);
    validation.passed = false;
    return { passed: false, gate2Data: null };
  }
}
