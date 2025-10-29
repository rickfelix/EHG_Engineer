/**
 * DESIGN→DATABASE Validation Gates - Gate 4 (LEAD Final)
 *
 * Validates workflow ROI and pattern effectiveness before final SD approval.
 * Executive-level validation with focus on value delivered and continuous improvement.
 *
 * Integration: unified-handoff-system.js (LEAD Final approval)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

/**
 * Validate workflow ROI and pattern effectiveness for LEAD final approval
 * Phase-Aware Weighting System (Strategic Value Focus)
 *
 * Checks (CRITICAL = 65pts, MAJOR = 25pts, MINOR = 10pts):
 * A. Process Adherence (10 points) - MINOR
 *    Process hygiene check (assumed at this stage)
 * B. Value Delivered (35 points) - CRITICAL
 *    ROI focus - what business value was created?
 * C. Pattern Effectiveness (30 points) - CRITICAL
 *    Strategic pattern assessment - should we repeat this?
 * D. Executive Validation (25 points) - MAJOR
 *    LEAD sign-off and governance
 *
 * Total: 100 points
 * Philosophy: LEAD cares about strategic value, not tactical process
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} allGateResults - Results from Gates 1-3 (optional)
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate4LeadFinal(sd_id, supabase, allGateResults = {}) {
  console.log('\n🚪 GATE 4: Workflow ROI & Pattern Effectiveness (LEAD Final)');
  console.log('='.repeat(60));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {},
    failed_gates: [],
    gate_scores: {}
  };

  try {
    // Fetch PRD metadata with DESIGN and DATABASE analyses
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata, directive_id, title, created_at')
      .eq('directive_id', sd_id)
      .single();

    if (prdError) {
      validation.issues.push(`Failed to fetch PRD: ${prdError.message}`);
      validation.failed_gates.push('PRD_FETCH');
      return validation;
    }

    const designAnalysis = prdData?.metadata?.design_analysis;
    const databaseAnalysis = prdData?.metadata?.database_analysis;

    if (!designAnalysis && !databaseAnalysis) {
      validation.warnings.push('No DESIGN or DATABASE analysis found - skipping Gate 4');
      validation.score = 100; // Pass by default if not applicable
      validation.passed = true;
      return validation;
    }

    // Fetch all previous gate results if not provided
    let gateResults = { ...allGateResults };
    if (!gateResults.gate1 && !gateResults.gate2 && !gateResults.gate3) {
      // Try to fetch from handoff metadata
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('handoff_type, metadata, created_at')
        .eq('sd_id', sd_id)
        .order('created_at', { ascending: false });

      if (handoffs) {
        for (const handoff of handoffs) {
          if (handoff.handoff_type === 'PLAN-TO-EXEC' && handoff.metadata?.gate1_validation) {
            gateResults.gate1 = handoff.metadata.gate1_validation;
          }
          if (handoff.handoff_type === 'EXEC-TO-PLAN' && handoff.metadata?.gate2_validation) {
            gateResults.gate2 = handoff.metadata.gate2_validation;
          }
          if (handoff.handoff_type === 'PLAN-TO-LEAD' && handoff.metadata?.gate3_validation) {
            gateResults.gate3 = handoff.metadata.gate3_validation;
          }
        }
      }
    }

    // ===================================================================
    // SECTION A: Process Adherence (25 points)
    // ===================================================================
    console.log('\n[A] Process Adherence');
    console.log('-'.repeat(60));

    await validateProcessAdherence(sd_id, prdData, gateResults, validation, supabase);

    // ===================================================================
    // SECTION B: Value Delivered (25 points)
    // ===================================================================
    console.log('\n[B] Value Delivered');
    console.log('-'.repeat(60));

    await validateValueDelivered(sd_id, designAnalysis, databaseAnalysis, gateResults, validation, supabase);

    // ===================================================================
    // SECTION C: Pattern Effectiveness (25 points)
    // ===================================================================
    console.log('\n[C] Pattern Effectiveness');
    console.log('-'.repeat(60));

    await validatePatternEffectiveness(sd_id, gateResults, validation, supabase);

    // ===================================================================
    // SECTION D: Executive Validation (25 points)
    // ===================================================================
    console.log('\n[D] Executive Validation');
    console.log('-'.repeat(60));

    await validateExecutiveApproval(sd_id, gateResults, validation, supabase);

    // ===================================================================
    // FINAL VALIDATION RESULT
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 4 SCORE: ${validation.score}/${validation.max_score} points`);

    if (validation.score >= 80) {
      validation.passed = true;
      console.log('✅ GATE 4: PASSED (≥80 points)');
      console.log('\n🎉 ALL VALIDATION GATES COMPLETE - SD READY FOR FINAL APPROVAL');
    } else {
      validation.passed = false;
      console.log(`❌ GATE 4: FAILED (${validation.score} < 80 points)`);
    }

    if (validation.issues.length > 0) {
      console.log(`\nBlocking Issues (${validation.issues.length}):`);
      validation.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
    }

    console.log('='.repeat(60));

    return validation;

  } catch (error) {
    console.error('\n❌ GATE 4 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

/**
 * Validate Process Adherence (Section A - 25 points)
 */
async function validateProcessAdherence(sd_id, prdData, gateResults, validation, _supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  // A1: PRD created via script (5 points)
  console.log('\n   [A1] PRD Creation Method...');

  const metadata = prdData?.metadata || {};
  const createdViaScript = metadata.created_via_script ||
                           metadata.design_analysis ||
                           metadata.database_analysis;

  if (createdViaScript) {
    sectionScore += 5;
    sectionDetails.prd_created_via_script = true;
    console.log('   ✅ PRD created via add-prd-to-database.js');
  } else {
    sectionScore += 3;
    validation.warnings.push('[A1] PRD may not have been created via script');
    console.log('   ⚠️  PRD creation method unclear (3/5)');
  }

  // A2: Design analysis completed (5 points)
  console.log('\n   [A2] Design Analysis Completion...');

  if (metadata.design_analysis) {
    sectionScore += 5;
    sectionDetails.design_analysis_completed = true;
    console.log('   ✅ DESIGN sub-agent analysis completed');
  } else {
    sectionScore += 3;
    validation.warnings.push('[A2] No DESIGN analysis found');
    console.log('   ⚠️  No DESIGN analysis (3/5)');
  }

  // A3: Database analysis completed (5 points)
  console.log('\n   [A3] Database Analysis Completion...');

  if (metadata.database_analysis) {
    sectionScore += 5;
    sectionDetails.database_analysis_completed = true;
    console.log('   ✅ DATABASE sub-agent analysis completed');
  } else {
    sectionScore += 3;
    validation.warnings.push('[A3] No DATABASE analysis found');
    console.log('   ⚠️  No DATABASE analysis (3/5)');
  }

  // A4: Design informed database (5 points)
  console.log('\n   [A4] Design-Informed Database Pattern...');

  if (metadata.database_analysis?.design_informed) {
    sectionScore += 5;
    sectionDetails.design_informed_database = true;
    console.log('   ✅ DATABASE was informed by DESIGN context');
  } else {
    sectionScore += 2;
    validation.warnings.push('[A4] DATABASE may not have been informed by DESIGN');
    console.log('   ⚠️  Design-informed pattern unclear (2/5)');
  }

  // A5: Proper workflow followed (5 points)
  console.log('\n   [A5] Workflow Execution Order...');

  // Check sub-agent execution order from Gate 1 results
  if (gateResults.gate1?.details?.execution_order_correct) {
    sectionScore += 5;
    sectionDetails.workflow_order_correct = true;
    console.log('   ✅ Proper DESIGN→DATABASE→STORIES order followed');
  } else {
    sectionScore += 3;
    validation.warnings.push('[A5] Workflow execution order not verified');
    console.log('   ⚠️  Execution order not verified (3/5)');
  }

  // Scale from 25 to 10 points (MINOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 25) * 10);
  validation.score += scaledScore;
  validation.gate_scores.process_adherence = scaledScore;
  validation.details.process_adherence = sectionDetails;
  console.log(`\n   Section A Score: ${scaledScore}/10 (MINOR - process hygiene)`);
}

/**
 * Validate Value Delivered (Section B - 35 points - CRITICAL)
 * Phase-aware: LEAD wants to see ROI and business value
 */
async function validateValueDelivered(sd_id, designAnalysis, databaseAnalysis, gateResults, validation, _supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  // B1: Time efficiency (10 points)
  console.log('\n   [B1] Time Efficiency...');

  // Check sub-agent execution time from Gate 3 results
  if (gateResults.gate3?.details?.sub_agent_effectiveness?.total_execution_time_ms) {
    const totalTimeMs = gateResults.gate3.details.sub_agent_effectiveness.total_execution_time_ms;
    const totalTimeMins = Math.round(totalTimeMs / 1000 / 60);

    sectionDetails.total_execution_time_minutes = totalTimeMins;

    // Sub-agent execution should be fast (< 15 mins for all 3)
    if (totalTimeMins < 15) {
      sectionScore += 10;
      console.log(`   ✅ Sub-agent execution: ${totalTimeMins} minutes (efficient)`);
    } else if (totalTimeMins < 30) {
      sectionScore += 7;
      console.log(`   ✅ Sub-agent execution: ${totalTimeMins} minutes (acceptable)`);
    } else {
      sectionScore += 5;
      validation.warnings.push(`[B1] Sub-agent execution took ${totalTimeMins} minutes`);
      console.log(`   ⚠️  Sub-agent execution: ${totalTimeMins} minutes (5/10)`);
    }
  } else {
    sectionScore += 5;
    console.log('   ⚠️  Cannot verify execution time (5/10)');
  }

  // B2: Quality of recommendations (10 points)
  console.log('\n   [B2] Recommendation Quality...');

  // Check if recommendations were substantial (from Gate 3)
  if (gateResults.gate3?.details?.sub_agent_effectiveness?.substantial_recommendations) {
    sectionScore += 10;
    sectionDetails.substantial_recommendations = true;
    console.log('   ✅ Sub-agents provided substantial recommendations');
  } else {
    sectionScore += 6;
    validation.warnings.push('[B2] Recommendation quality not verified');
    console.log('   ⚠️  Recommendation quality unclear (6/10)');
  }

  // B3: Implementation fidelity (5 points)
  console.log('\n   [B3] Implementation Fidelity...');

  // Check if implementation followed recommendations (from Gate 2)
  if (gateResults.gate2?.score >= 80) {
    sectionScore += 5;
    sectionDetails.high_implementation_fidelity = true;
    console.log('   ✅ High implementation fidelity (Gate 2 ≥80)');
  } else if (gateResults.gate2?.score >= 70) {
    sectionScore += 3;
    console.log('   ⚠️  Moderate implementation fidelity (3/5)');
  } else {
    sectionScore += 2;
    validation.warnings.push('[B3] Low implementation fidelity');
    console.log('   ⚠️  Low implementation fidelity (2/5)');
  }

  // Scale from 25 to 35 points (CRITICAL - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 25) * 35);
  validation.score += scaledScore;
  validation.gate_scores.value_delivered = scaledScore;
  validation.details.value_delivered = sectionDetails;
  console.log(`\n   Section B Score: ${scaledScore}/35 (CRITICAL - ROI focus)`);
}

/**
 * Validate Pattern Effectiveness (Section C - 30 points - CRITICAL)
 * Phase-aware: Strategic assessment of pattern success
 */
async function validatePatternEffectiveness(sd_id, gateResults, validation, _supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [C] Pattern Effectiveness...');

  // C1: Gate 1 performance (6 points)
  console.log('\n   [C1] Gate 1 (PLAN→EXEC) Performance...');

  if (gateResults.gate1?.score >= 90) {
    sectionScore += 6;
    console.log(`   ✅ Gate 1 score: ${gateResults.gate1.score}/100 (excellent)`);
  } else if (gateResults.gate1?.score >= 80) {
    sectionScore += 5;
    console.log(`   ✅ Gate 1 score: ${gateResults.gate1.score}/100 (good)`);
  } else if (gateResults.gate1?.score) {
    sectionScore += 3;
    validation.warnings.push(`[C1] Gate 1 score: ${gateResults.gate1.score}/100`);
    console.log(`   ⚠️  Gate 1 score: ${gateResults.gate1.score}/100 (3/6)`);
  } else {
    sectionScore += 3;
    console.log('   ⚠️  Gate 1 score unavailable (3/6)');
  }

  // C2: Gate 2 performance (6 points)
  console.log('\n   [C2] Gate 2 (EXEC→PLAN) Performance...');

  if (gateResults.gate2?.score >= 90) {
    sectionScore += 6;
    console.log(`   ✅ Gate 2 score: ${gateResults.gate2.score}/100 (excellent)`);
  } else if (gateResults.gate2?.score >= 80) {
    sectionScore += 5;
    console.log(`   ✅ Gate 2 score: ${gateResults.gate2.score}/100 (good)`);
  } else if (gateResults.gate2?.score) {
    sectionScore += 3;
    validation.warnings.push(`[C2] Gate 2 score: ${gateResults.gate2.score}/100`);
    console.log(`   ⚠️  Gate 2 score: ${gateResults.gate2.score}/100 (3/6)`);
  } else {
    sectionScore += 3;
    console.log('   ⚠️  Gate 2 score unavailable (3/6)');
  }

  // C3: Gate 3 performance (6 points)
  console.log('\n   [C3] Gate 3 (PLAN→LEAD) Performance...');

  if (gateResults.gate3?.score >= 90) {
    sectionScore += 6;
    console.log(`   ✅ Gate 3 score: ${gateResults.gate3.score}/100 (excellent)`);
  } else if (gateResults.gate3?.score >= 80) {
    sectionScore += 5;
    console.log(`   ✅ Gate 3 score: ${gateResults.gate3.score}/100 (good)`);
  } else if (gateResults.gate3?.score) {
    sectionScore += 3;
    validation.warnings.push(`[C3] Gate 3 score: ${gateResults.gate3.score}/100`);
    console.log(`   ⚠️  Gate 3 score: ${gateResults.gate3.score}/100 (3/6)`);
  } else {
    sectionScore += 3;
    console.log('   ⚠️  Gate 3 score unavailable (3/6)');
  }

  // C4: Overall pattern ROI (7 points)
  console.log('\n   [C4] Overall Pattern ROI...');

  // Calculate average gate score
  const gateScores = [
    gateResults.gate1?.score,
    gateResults.gate2?.score,
    gateResults.gate3?.score
  ].filter(s => s !== undefined);

  if (gateScores.length > 0) {
    const avgScore = gateScores.reduce((sum, s) => sum + s, 0) / gateScores.length;
    sectionDetails.average_gate_score = Math.round(avgScore);

    if (avgScore >= 90) {
      sectionScore += 7;
      sectionDetails.roi_assessment = 'EXCELLENT - Continue pattern';
      console.log(`   ✅ Average gate score: ${Math.round(avgScore)}/100 (excellent ROI)`);
    } else if (avgScore >= 80) {
      sectionScore += 6;
      sectionDetails.roi_assessment = 'GOOD - Continue pattern';
      console.log(`   ✅ Average gate score: ${Math.round(avgScore)}/100 (good ROI)`);
    } else if (avgScore >= 70) {
      sectionScore += 4;
      sectionDetails.roi_assessment = 'ACCEPTABLE - Monitor pattern';
      console.log(`   ⚠️  Average gate score: ${Math.round(avgScore)}/100 (4/7)`);
    } else {
      sectionScore += 2;
      sectionDetails.roi_assessment = 'LOW - Review pattern';
      validation.warnings.push(`[C4] Low average gate score: ${Math.round(avgScore)}/100`);
      console.log(`   ⚠️  Average gate score: ${Math.round(avgScore)}/100 (2/7)`);
    }
  } else {
    sectionScore += 4;
    console.log('   ⚠️  Cannot calculate ROI (4/7)');
  }

  // Scale from 25 to 30 points (CRITICAL - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 25) * 30);
  validation.score += scaledScore;
  validation.gate_scores.pattern_effectiveness = scaledScore;
  validation.details.pattern_effectiveness = sectionDetails;
  console.log(`\n   Section C Score: ${scaledScore}/30 (CRITICAL - pattern assessment)`);
}

/**
 * Validate Executive Approval Requirements (Section D - 25 points - MAJOR)
 * Phase-aware: Executive governance and sign-off
 */
async function validateExecutiveApproval(sd_id, gateResults, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Executive Validation...');

  // D1: All gates passed (10 points)
  console.log('\n   [D1] All Validation Gates Passed...');

  const gate1Passed = gateResults.gate1?.passed;
  const gate2Passed = gateResults.gate2?.passed;
  const gate3Passed = gateResults.gate3?.passed;

  const passedCount = [gate1Passed, gate2Passed, gate3Passed].filter(Boolean).length;
  sectionDetails.gates_passed = passedCount;
  sectionDetails.gates_total = 3;

  if (passedCount === 3) {
    sectionScore += 10;
    console.log('   ✅ All 3 gates passed (Gate 1, 2, 3)');
  } else if (passedCount === 2) {
    sectionScore += 6;
    validation.warnings.push(`[D1] Only ${passedCount}/3 gates passed`);
    console.log(`   ⚠️  Only ${passedCount}/3 gates passed (6/10)`);
  } else if (passedCount === 1) {
    sectionScore += 3;
    validation.issues.push(`[D1] Only ${passedCount}/3 gates passed - review required`);
    console.log(`   ⚠️  Only ${passedCount}/3 gates passed (3/10)`);
  } else {
    sectionScore += 0;
    validation.issues.push('[D1] No gates passed - SD requires review');
    console.log('   ❌ No gates passed (0/10)');
  }

  // D2: Quality thresholds met (10 points)
  console.log('\n   [D2] Quality Thresholds...');

  // Check if retrospective exists
  const { data: retroData } = await supabase
    .from('sd_retrospectives')
    .select('id, quality_score')
    .eq('sd_id', sd_id)
    .single();

  if (retroData) {
    sectionScore += 10;
    sectionDetails.retrospective_exists = true;
    if (retroData.quality_score) {
      sectionDetails.retrospective_quality_score = retroData.quality_score;
    }
    console.log('   ✅ Retrospective created (quality documented)');
  } else {
    sectionScore += 5;
    validation.warnings.push('[D2] No retrospective found yet');
    console.log('   ⚠️  No retrospective yet (5/10)');
  }

  // D3: Pattern recommendation (5 points)
  console.log('\n   [D3] Pattern Recommendation...');

  // Based on overall performance, recommend continuation
  const avgGateScore = validation.details.pattern_effectiveness?.average_gate_score;

  if (avgGateScore >= 80) {
    sectionScore += 5;
    sectionDetails.pattern_recommendation = 'CONTINUE - Pattern is effective';
    console.log('   ✅ Recommend continuing DESIGN→DATABASE pattern');
  } else if (avgGateScore >= 70) {
    sectionScore += 3;
    sectionDetails.pattern_recommendation = 'MONITOR - Pattern needs improvement';
    console.log('   ⚠️  Monitor pattern effectiveness (3/5)');
  } else if (avgGateScore) {
    sectionScore += 2;
    sectionDetails.pattern_recommendation = 'REVIEW - Pattern may need adjustment';
    validation.warnings.push('[D3] Pattern effectiveness below target');
    console.log('   ⚠️  Review pattern (2/5)');
  } else {
    sectionScore += 3;
    sectionDetails.pattern_recommendation = 'UNKNOWN - Insufficient data';
    console.log('   ⚠️  Insufficient data for recommendation (3/5)');
  }

  // Keep at 25 points (MAJOR - no scaling needed)
  validation.score += sectionScore;
  validation.gate_scores.executive_validation = sectionScore;
  validation.details.executive_validation = sectionDetails;
  console.log(`\n   Section D Score: ${sectionScore}/25 (MAJOR - executive governance)`);
}
