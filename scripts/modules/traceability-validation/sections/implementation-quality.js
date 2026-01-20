/**
 * Section B: Implementation Quality (30 points - CRITICAL)
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 *
 * Phase-aware: LEAD cares if work is good quality
 */

/**
 * Validate Implementation Quality
 * @param {string} sd_id - Strategic Directive ID
 * @param {string} sdUuid - Resolved SD UUID
 * @param {Object} gate2Data - Gate 2 validation results
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateImplementationQuality(sd_id, sdUuid, gate2Data, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  // B1: Overall Gate 2 score (10 points)
  console.log('\n   [B1] Gate 2 Overall Score...');

  if (gate2Data?.score !== undefined) {
    const gate2Score = gate2Data.score;
    sectionDetails.gate2_score = gate2Score;

    if (gate2Score >= 90) {
      sectionScore += 10;
      console.log(`   OK Gate 2 score: ${gate2Score}/100 (excellent)`);
    } else if (gate2Score >= 80) {
      sectionScore += 8;
      console.log(`   OK Gate 2 score: ${gate2Score}/100 (good)`);
    } else if (gate2Score >= 70) {
      sectionScore += 6;
      validation.warnings.push(`[B1] Gate 2 score below 80: ${gate2Score}/100`);
      console.log(`   WARN Gate 2 score: ${gate2Score}/100 (6/10)`);
    } else {
      sectionScore += 3;
      validation.warnings.push(`[B1] Low Gate 2 score: ${gate2Score}/100`);
      console.log(`   WARN Gate 2 score: ${gate2Score}/100 (3/10)`);
    }
  } else {
    sectionScore += 5;
    console.log('   WARN No Gate 2 score available (5/10)');
  }

  // B2: Test coverage (10 points)
  console.log('\n   [B2] Test Coverage...');

  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata, deliverables_manifest')
    .eq('sd_id', sdUuid)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]) {
    const metadata = handoffData[0].metadata || {};
    const deliverables = handoffData[0].deliverables_manifest || {};

    const metadataStr = JSON.stringify(metadata).toLowerCase();
    const deliverablesStr = JSON.stringify(deliverables).toLowerCase();

    const hasTestCoverage = metadataStr.includes('test') ||
                             metadataStr.includes('coverage') ||
                             deliverablesStr.includes('test') ||
                             deliverablesStr.includes('e2e');

    if (hasTestCoverage) {
      sectionScore += 10;
      sectionDetails.test_coverage_documented = true;
      console.log('   OK Test coverage documented');
    } else {
      sectionScore += 5;
      validation.warnings.push('[B2] Test coverage not clearly documented');
      console.log('   WARN Test coverage not clearly documented (5/10)');
    }
  } else {
    sectionScore += 5;
    console.log('   WARN No EXEC->PLAN handoff found (5/10)');
  }

  // Scale from 20 to 30 points (CRITICAL - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 30);
  validation.score += scaledScore;
  validation.gate_scores.implementation_quality = scaledScore;
  validation.details.implementation_quality = sectionDetails;
  console.log(`\n   Section B Score: ${scaledScore}/30 (CRITICAL - quality focus)`);
}
