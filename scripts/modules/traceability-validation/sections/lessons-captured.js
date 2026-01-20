/**
 * Section E: Lessons Captured (5 points - MINOR)
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 *
 * Phase-aware: Retrospective prep least important at handoff
 */

/**
 * Validate Lessons Captured
 * @param {string} sd_id - Strategic Directive ID
 * @param {string} sdUuid - Resolved SD UUID
 * @param {Object} designAnalysis - Design analysis from PRD
 * @param {Object} databaseAnalysis - Database analysis from PRD
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateLessonsCaptured(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [E] Lessons Captured...');

  // E1: Check for retrospective preparation (10 points)
  console.log('\n   [E1] Retrospective Preparation...');

  // Check if a retrospective exists in the retrospectives table
  const { data: retrospective } = await supabase
    .from('retrospectives')
    .select('id, quality_score, publication_status')
    .eq('sd_id', sd_id)
    .order('created_at', { ascending: false })
    .limit(1);

  // Also check EXEC-TO-PLAN handoff for retrospective prep keywords
  const { data: execToplanHandoff } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata')
    .eq('sd_id', sdUuid)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  const hasRetrospective = retrospective && retrospective.length > 0;
  let hasRetroPrep = false;

  if (execToplanHandoff?.[0]?.metadata) {
    const metadataStr = JSON.stringify(execToplanHandoff[0].metadata).toLowerCase();
    hasRetroPrep = metadataStr.includes('lesson') ||
                   metadataStr.includes('retrospective') ||
                   metadataStr.includes('improvement');
  }

  if (hasRetrospective) {
    sectionScore += 10;
    sectionDetails.retrospective_prepared = true;
    sectionDetails.retrospective_id = retrospective[0].id;
    sectionDetails.quality_score = retrospective[0].quality_score;
    console.log(`   OK Retrospective found (quality score: ${retrospective[0].quality_score || 'N/A'})`);
  } else if (hasRetroPrep) {
    sectionScore += 8;
    sectionDetails.retrospective_prepared = true;
    console.log('   OK Retrospective preparation found in EXEC->PLAN handoff (8/10)');
  } else {
    sectionScore += 5;
    validation.warnings.push('[E1] No retrospective preparation detected');
    console.log('   WARN No retrospective prep detected (5/10)');
  }

  // E2: Workflow effectiveness notes (10 points)
  console.log('\n   [E2] Workflow Effectiveness Notes...');

  const { data: execHandoff } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata, deliverables_manifest')
    .eq('sd_id', sdUuid)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (execHandoff?.[0]) {
    const combinedStr = JSON.stringify({
      ...execHandoff[0].metadata,
      ...execHandoff[0].deliverables_manifest
    }).toLowerCase();

    const hasWorkflowNotes = combinedStr.includes('workflow') ||
                              combinedStr.includes('process') ||
                              combinedStr.includes('pattern');

    if (hasWorkflowNotes) {
      sectionScore += 10;
      sectionDetails.workflow_effectiveness_noted = true;
      console.log('   OK Workflow effectiveness mentioned');
    } else {
      sectionScore += 5;
      validation.warnings.push('[E2] Workflow effectiveness not documented');
      console.log('   WARN Workflow effectiveness not documented (5/10)');
    }
  } else {
    sectionScore += 5;
    console.log('   WARN No EXEC->PLAN handoff to assess (5/10)');
  }

  // Scale from 20 to 5 points (MINOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 5);
  validation.score += scaledScore;
  validation.gate_scores.lessons_captured = scaledScore;
  validation.details.lessons_captured = sectionDetails;
  console.log(`\n   Section E Score: ${scaledScore}/5 (MINOR - retrospective prep)`);
}
