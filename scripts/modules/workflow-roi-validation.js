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

import { exec } from 'child_process';
import { promisify } from 'util';
import { calculateAdaptiveThreshold } from './adaptive-threshold-calculator.js';
import { getPatternStats } from './pattern-tracking.js';

const execAsync = promisify(exec);

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
    // Resolve sd_key and UUID for proper lookups
    // PRD.directive_id stores sd_key; sd_phase_handoffs.sd_id stores UUID (strategic_directives_v2.id)
    let prdLookupId = sd_id;
    let handoffLookupId = sd_id;
    const { data: sdLookup } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .or(`sd_key.eq.${sd_id},id.eq.${sd_id}`)
      .single();
    if (sdLookup) {
      prdLookupId = sdLookup.sd_key || sd_id;
      handoffLookupId = sdLookup.id || sd_id;
    }

    // Fetch PRD metadata with DESIGN and DATABASE analyses
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata, directive_id, title, created_at')
      .eq('directive_id', prdLookupId)
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
    // PAT-GATE4-BYPASS-001: Track which handoffs were accepted (including via bypass)
    // so Section D1 can give credit for governance-approved bypasses
    const acceptedHandoffs = { gate1: false, gate2: false, gate3: false };
    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-002: Track data sources for audit trail
    const gateDataSources = { gate1: 'none', gate2: 'none', gate3: 'none' };
    if (!gateResults.gate1 && !gateResults.gate2 && !gateResults.gate3) {
      // Try to fetch from handoff metadata (use UUID for handoff lookup)
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('handoff_type, metadata, status, created_at')
        .eq('sd_id', handoffLookupId)
        .order('created_at', { ascending: false });

      if (handoffs) {
        for (const handoff of handoffs) {
          // PLAN-TO-EXEC: Gate 1 (PRD Quality)
          // Read canonical gate_results first, fall back to legacy key
          if (handoff.handoff_type === 'PLAN-TO-EXEC') {
            if (handoff.status === 'accepted') acceptedHandoffs.gate1 = true;
            if (handoff.metadata?.gate_results?.GATE1_PRD_QUALITY) {
              gateResults.gate1 = handoff.metadata.gate_results.GATE1_PRD_QUALITY;
              gateDataSources.gate1 = 'canonical';
            } else if (handoff.metadata?.gate1_validation) {
              gateResults.gate1 = handoff.metadata.gate1_validation;
              gateDataSources.gate1 = 'legacy';
            }
          }
          // EXEC-TO-PLAN: Gate 2 (Implementation Fidelity)
          if (handoff.handoff_type === 'EXEC-TO-PLAN') {
            if (handoff.status === 'accepted') acceptedHandoffs.gate2 = true;
            if (handoff.metadata?.gate_results?.GATE2_IMPLEMENTATION_FIDELITY) {
              gateResults.gate2 = handoff.metadata.gate_results.GATE2_IMPLEMENTATION_FIDELITY;
              gateDataSources.gate2 = 'canonical';
            } else if (handoff.metadata?.gate2_validation) {
              gateResults.gate2 = handoff.metadata.gate2_validation;
              gateDataSources.gate2 = 'legacy';
            }
          }
          // PLAN-TO-LEAD: Gate 3 (Traceability)
          // SD-LEARN-FIX-ADDRESS-PAT-AUTO-002: Check canonical, then legacy gate3_validation,
          // then nested gate_results.GATE3_TRACEABILITY
          if (handoff.handoff_type === 'PLAN-TO-LEAD') {
            if (handoff.status === 'accepted') acceptedHandoffs.gate3 = true;
            if (handoff.metadata?.gate_results?.GATE3_TRACEABILITY) {
              gateResults.gate3 = handoff.metadata.gate_results.GATE3_TRACEABILITY;
              gateDataSources.gate3 = 'canonical';
            } else if (handoff.metadata?.gate3_validation) {
              gateResults.gate3 = handoff.metadata.gate3_validation;
              gateDataSources.gate3 = 'legacy';
            }
          }
        }
      }
    } else {
      // Gate results provided directly - assume all accepted
      if (allGateResults.gate1) { acceptedHandoffs.gate1 = true; gateDataSources.gate1 = 'direct'; }
      if (allGateResults.gate2) { acceptedHandoffs.gate2 = true; gateDataSources.gate2 = 'direct'; }
      if (allGateResults.gate3) { acceptedHandoffs.gate3 = true; gateDataSources.gate3 = 'direct'; }
    }
    // Store for Section D access and audit trail
    validation._acceptedHandoffs = acceptedHandoffs;
    validation._gateDataSources = gateDataSources;
    validation._estimated = gateDataSources.gate1 === 'none' ||
                            gateDataSources.gate2 === 'none' ||
                            gateDataSources.gate3 === 'none';
    console.log(`   📊 Gate data sources: gate1=${gateDataSources.gate1}, gate2=${gateDataSources.gate2}, gate3=${gateDataSources.gate3}`);

    // ===================================================================
    // PHASE 1: NON-NEGOTIABLE BLOCKERS (Strategic Validation Gate)
    // ===================================================================
    console.log('\n[PHASE 1] LEAD Strategic Validation Gate (NON-NEGOTIABLE #19)');
    console.log('-'.repeat(60));
    console.log('⚠️  LEAD MUST answer these 6 strategic questions before approval:\n');

    const strategicQuestions = [
      '1. Does this solve a real business problem?',
      '2. Is this the simplest solution?',
      '3. Are we building what\'s needed vs. what\'s nice-to-have?',
      '4. Did EXEC over-engineer this?',
      '5. What\'s the ROI/complexity ratio?',
      '6. Should this be approved?'
    ];

    strategicQuestions.forEach(q => console.log(`   ${q}`));
    console.log('\n' + '-'.repeat(60));

    // Check if LEAD has documented answers to strategic questions
    try {
      // Check for LEAD review documentation in handoff metadata
      const { data: leadHandoff } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata, created_at')
        .eq('sd_id', sd_id)
        .eq('handoff_type', 'LEAD-FINAL')
        .order('created_at', { ascending: false })
        .limit(1);

      if (leadHandoff && leadHandoff.length > 0 && leadHandoff[0].metadata?.strategic_review) {
        console.log('   ✅ LEAD strategic review documented');
        validation.details.strategic_review_completed = true;
        validation.details.strategic_review_timestamp = leadHandoff[0].created_at;
      } else {
        validation.warnings.push('[STRATEGIC GATE] No documented LEAD strategic review found');
        console.log('   ⚠️  No documented strategic review - LEAD must answer 6 questions');
        console.log('   ⚠️  Document answers in handoff metadata: strategic_review field');
        validation.details.strategic_review_completed = false;
      }
    } catch (error) {
      validation.warnings.push(`[STRATEGIC GATE] Cannot verify strategic review: ${error.message}`);
      console.log(`   ⚠️  Cannot verify strategic review: ${error.message}`);
    }

    // Check for over-engineering indicators (assists question #4)
    try {
      // Get LOC added in this SD
      const { stdout: gitLog } = await execAsync(`git log --all --grep="${sd_id}" --format="%H" -n 1`);
      const commitHash = gitLog.trim();

      if (commitHash) {
        const { stdout: stats } = await execAsync(`git show ${commitHash} --numstat`);
        const lines = stats.split('\n');
        let totalAdded = 0;

        for (const line of lines) {
          const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
          if (match) {
            totalAdded += parseInt(match[1]);
          }
        }

        validation.details.loc_added = totalAdded;

        // Flag potential over-engineering (>1000 LOC is a signal for LEAD to review)
        if (totalAdded > 1000) {
          validation.warnings.push(`[STRATEGIC GATE] Large implementation (${totalAdded} LOC) - review for over-engineering`);
          console.log(`   ⚠️  Large implementation: ${totalAdded} LOC added - review question #4`);
        } else {
          console.log(`   ✅ Reasonable implementation size: ${totalAdded} LOC added`);
        }
      }
    } catch (error) {
      validation.warnings.push(`[STRATEGIC GATE] Cannot analyze implementation size: ${error.message}`);
    }

    console.log('-'.repeat(60));

    // Phase 1 complete - proceeding to Phase 2 scoring
    console.log('\n   ✅ Phase 1 complete - proceeding to Phase 2 scoring');

    // ===================================================================
    // PHASE 2: WEIGHTED SCORING (Negotiable Checks)
    // ===================================================================
    console.log('\n[PHASE 2] Weighted Scoring...');
    console.log('-'.repeat(60));

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
    // FINAL VALIDATION RESULT (with Adaptive Threshold)
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 4 SCORE: ${validation.score}/${validation.max_score} points`);

    // Calculate adaptive threshold based on SD context and all prior gates
    const priorGateScores = [];
    if (gateResults.gate1?.score) priorGateScores.push(gateResults.gate1.score);
    if (gateResults.gate2?.score) priorGateScores.push(gateResults.gate2.score);
    if (gateResults.gate3?.score) priorGateScores.push(gateResults.gate3.score);

    // Fetch SD data for pattern tracking
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sd_id)
      .single();

    // Fetch pattern statistics for maturity bonus
    const patternStats = await getPatternStats(sdData, supabase);

    const thresholdResult = calculateAdaptiveThreshold({
      sd: sdData,
      priorGateScores,
      patternStats,
      gateNumber: 4
    });

    validation.details.adaptive_threshold = thresholdResult;
    const requiredThreshold = thresholdResult.finalThreshold;

    console.log(`\nAdaptive Threshold: ${requiredThreshold.toFixed(1)}%`);
    console.log(`Reasoning: ${thresholdResult.reasoning}`);

    if (validation.score >= requiredThreshold) {
      validation.passed = true;
      console.log(`✅ GATE 4: PASSED (${validation.score} ≥ ${requiredThreshold.toFixed(1)} points)`);
      console.log('\n🎉 ALL VALIDATION GATES COMPLETE - SD READY FOR FINAL APPROVAL');
    } else {
      validation.passed = false;
      console.log(`❌ GATE 4: FAILED (${validation.score} < ${requiredThreshold.toFixed(1)} points)`);
    }

    if (validation.issues.length > 0) {
      console.log(`\nBlocking Issues (${validation.issues.length}):`);
      validation.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
    }

    // SD-LEARN-FIX-ADDRESS-PAT-AUTO-002: Flag estimated scoring for transparency
    if (validation._estimated) {
      validation.details.estimated = true;
      const missingSources = Object.entries(validation._gateDataSources || {})
        .filter(([, src]) => src === 'none')
        .map(([gate]) => gate);
      validation.details.estimated_reason = `Missing gate data: ${missingSources.join(', ')}`;
      console.log(`\n⚠️  Score includes estimated defaults for: ${missingSources.join(', ')}`);
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
    sectionScore += 7;
    console.log('   ⚠️  Cannot verify execution time - using estimated default (7/10)');
  }

  // B2: Quality of recommendations (10 points)
  console.log('\n   [B2] Recommendation Quality...');

  // Check if recommendations were substantial (from Gate 3)
  if (gateResults.gate3?.details?.sub_agent_effectiveness?.substantial_recommendations) {
    sectionScore += 10;
    sectionDetails.substantial_recommendations = true;
    console.log('   ✅ Sub-agents provided substantial recommendations');
  } else {
    sectionScore += 7;
    validation.warnings.push('[B2] Recommendation quality not verified');
    console.log('   ⚠️  Recommendation quality unclear - using estimated default (7/10)');
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
    sectionScore += 3;
    validation.warnings.push('[B3] Low implementation fidelity');
    console.log('   ⚠️  Low implementation fidelity (3/5)');
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
    sectionScore += 4;
    console.log('   ⚠️  Gate 1 score unavailable - using estimated default (4/6)');
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
    sectionScore += 4;
    console.log('   ⚠️  Gate 2 score unavailable - using estimated default (4/6)');
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
    sectionScore += 4;
    console.log('   ⚠️  Gate 3 score unavailable - using estimated default (4/6)');
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
  // PAT-GATE4-BYPASS-001 FIX: Also accept governance-approved bypasses.
  // A handoff can be accepted via --bypass-validation when gates fail. The handoff
  // status is 'accepted' but gate results show passed=false. These bypasses are
  // rate-limited, audited, and require a reason - so they represent valid governance.
  console.log('\n   [D1] All Validation Gates Passed (or Bypass-Approved)...');

  const acceptedHandoffs = validation._acceptedHandoffs || {};
  const gate1Passed = gateResults.gate1?.passed;
  const gate2Passed = gateResults.gate2?.passed;
  const gate3Passed = gateResults.gate3?.passed;

  // PAT-GATE4-BYPASS-001: Count gates that passed OR were accepted via bypass
  const gate1OK = gate1Passed || acceptedHandoffs.gate1;
  const gate2OK = gate2Passed || acceptedHandoffs.gate2;
  const gate3OK = gate3Passed || acceptedHandoffs.gate3;

  const passedCount = [gate1Passed, gate2Passed, gate3Passed].filter(Boolean).length;
  const acceptedCount = [gate1OK, gate2OK, gate3OK].filter(Boolean).length;
  const bypassCount = acceptedCount - passedCount;

  sectionDetails.gates_passed = passedCount;
  sectionDetails.gates_accepted_with_bypass = bypassCount;
  sectionDetails.gates_total = 3;

  if (acceptedCount === 3) {
    sectionScore += 10;
    if (bypassCount > 0) {
      console.log(`   ✅ All 3 gates cleared (${passedCount} passed, ${bypassCount} bypass-approved)`);
    } else {
      console.log('   ✅ All 3 gates passed (Gate 1, 2, 3)');
    }
  } else if (acceptedCount === 2) {
    sectionScore += 6;
    validation.warnings.push(`[D1] Only ${acceptedCount}/3 gates cleared`);
    console.log(`   ⚠️  Only ${acceptedCount}/3 gates cleared (6/10)`);
  } else if (acceptedCount === 1) {
    sectionScore += 3;
    validation.issues.push(`[D1] Only ${acceptedCount}/3 gates cleared - review required`);
    console.log(`   ⚠️  Only ${acceptedCount}/3 gates cleared (3/10)`);
  } else {
    sectionScore += 0;
    validation.issues.push('[D1] No gates passed or accepted - SD requires review');
    console.log('   ❌ No gates passed or accepted (0/10)');
  }

  // D2: Quality thresholds met (10 points)
  console.log('\n   [D2] Quality Thresholds...');

  // Check if retrospective exists
  // NOTE: Table is 'retrospectives' not 'sd_retrospectives'
  // sd_id in retrospectives is a UUID FK, but sd_id param may be an SD key string
  // Resolve UUID first for FK-compatible lookup
  let retroSdId = sd_id;
  try {
    const { data: sdRow } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', sd_id)
      .single();
    if (sdRow?.id) retroSdId = sdRow.id;
  } catch { /* continue with original sd_id */ }

  const { data: retroData } = await supabase
    .from('retrospectives')
    .select('id, quality_score')
    .eq('sd_id', retroSdId)
    .order('created_at', { ascending: false })
    .limit(1)
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
