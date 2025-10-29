/**
 * DESIGN→DATABASE Validation Gates - Gate 3 (PLAN→LEAD)
 *
 * Validates end-to-end traceability and recommendation adherence
 * before LEAD final approval.
 *
 * Integration: unified-handoff-system.js (PLAN→LEAD handoff)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Validate end-to-end traceability for PLAN→LEAD handoff
 * Phase-Aware Weighting System (Fidelity Focus)
 *
 * Checks (CRITICAL = 60pts, MAJOR = 25pts, MINOR = 15pts):
 * A. Recommendation Adherence (30 points) - CRITICAL
 *    Did EXEC deliver what PLAN designed?
 * B. Implementation Quality (30 points) - CRITICAL
 *    Is the work good quality? (uses Gate 2 scores)
 * C. Traceability Mapping (25 points) - MAJOR
 *    Can we trace decisions (PRD→code, design→UI, DB→schema)?
 * D. Sub-Agent Effectiveness (10 points) - MINOR
 *    Meta-analysis of sub-agent performance
 * E. Lessons Captured (5 points) - MINOR
 *    Retrospective preparation
 *
 * Total: 100 points
 * Philosophy: LEAD cares about fidelity, not process meta-analysis
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @param {Object} gate2Results - Results from Gate 2 validation (optional)
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate3PlanToLead(sd_id, supabase, gate2Results = null) {
  console.log('\n🚪 GATE 3: End-to-End Traceability Validation (PLAN→LEAD)');
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
      .select('metadata, directive_id, title')
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
      validation.warnings.push('No DESIGN or DATABASE analysis found - skipping Gate 3');
      validation.score = 100; // Pass by default if not applicable
      validation.passed = true;
      return validation;
    }

    // Fetch Gate 2 results if not provided
    let gate2Data = gate2Results;
    if (!gate2Data) {
      const { data: handoffData } = await supabase
        .from('sd_phase_handoffs')
        .select('metadata')
        .eq('sd_id', sd_id)
        .eq('handoff_type', 'EXEC-TO-PLAN')
        .order('created_at', { ascending: false })
        .limit(1);

      gate2Data = handoffData?.[0]?.metadata?.gate2_validation || null;
    }

    // ===================================================================
    // SECTION A: Recommendation Adherence (20 points)
    // ===================================================================
    console.log('\n[A] Recommendation Adherence');
    console.log('-'.repeat(60));

    await validateRecommendationAdherence(sd_id, designAnalysis, databaseAnalysis, gate2Data, validation, supabase);

    // ===================================================================
    // SECTION B: Implementation Quality (20 points)
    // ===================================================================
    console.log('\n[B] Implementation Quality');
    console.log('-'.repeat(60));

    await validateImplementationQuality(sd_id, gate2Data, validation, supabase);

    // ===================================================================
    // SECTION C: Traceability Mapping (20 points)
    // ===================================================================
    console.log('\n[C] Traceability Mapping');
    console.log('-'.repeat(60));

    await validateTraceabilityMapping(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // SECTION D: Sub-Agent Effectiveness (20 points)
    // ===================================================================
    console.log('\n[D] Sub-Agent Effectiveness');
    console.log('-'.repeat(60));

    await validateSubAgentEffectiveness(sd_id, validation, supabase);

    // ===================================================================
    // SECTION E: Lessons Captured (20 points)
    // ===================================================================
    console.log('\n[E] Lessons Captured');
    console.log('-'.repeat(60));

    await validateLessonsCaptured(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // FINAL VALIDATION RESULT
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 3 SCORE: ${validation.score}/${validation.max_score} points`);

    if (validation.score >= 80) {
      validation.passed = true;
      console.log('✅ GATE 3: PASSED (≥80 points)');
    } else {
      validation.passed = false;
      console.log(`❌ GATE 3: FAILED (${validation.score} < 80 points)`);
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
    console.error('\n❌ GATE 3 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

/**
 * Validate Recommendation Adherence (Section A - 20 points)
 */
async function validateRecommendationAdherence(sd_id, designAnalysis, databaseAnalysis, gate2Data, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  // A1: Design recommendations adherence (10 points)
  console.log('\n   [A1] Design Recommendations Adherence...');

  if (designAnalysis && gate2Data?.gate_scores?.design_fidelity !== undefined) {
    const designFidelity = gate2Data.gate_scores.design_fidelity;
    const adherencePercent = (designFidelity / 25) * 100;

    sectionDetails.design_adherence_percent = Math.round(adherencePercent);

    if (adherencePercent >= 80) {
      sectionScore += 10;
      console.log(`   ✅ Design adherence: ${Math.round(adherencePercent)}%`);
    } else if (adherencePercent >= 60) {
      sectionScore += 7;
      validation.warnings.push(`[A1] Design adherence below target: ${Math.round(adherencePercent)}%`);
      console.log(`   ⚠️  Design adherence: ${Math.round(adherencePercent)}% (7/10)`);
    } else {
      sectionScore += 4;
      validation.warnings.push(`[A1] Low design adherence: ${Math.round(adherencePercent)}%`);
      console.log(`   ⚠️  Design adherence: ${Math.round(adherencePercent)}% (4/10)`);
    }
  } else {
    sectionScore += 5; // Partial credit if no design analysis
    console.log('   ⚠️  No design fidelity data available (5/10)');
  }

  // A2: Database recommendations adherence (10 points)
  console.log('\n   [A2] Database Recommendations Adherence...');

  if (databaseAnalysis && gate2Data?.gate_scores?.database_fidelity !== undefined) {
    const databaseFidelity = gate2Data.gate_scores.database_fidelity;
    const adherencePercent = (databaseFidelity / 25) * 100;

    sectionDetails.database_adherence_percent = Math.round(adherencePercent);

    if (adherencePercent >= 80) {
      sectionScore += 10;
      console.log(`   ✅ Database adherence: ${Math.round(adherencePercent)}%`);
    } else if (adherencePercent >= 60) {
      sectionScore += 7;
      validation.warnings.push(`[A2] Database adherence below target: ${Math.round(adherencePercent)}%`);
      console.log(`   ⚠️  Database adherence: ${Math.round(adherencePercent)}% (7/10)`);
    } else {
      sectionScore += 4;
      validation.warnings.push(`[A2] Low database adherence: ${Math.round(adherencePercent)}%`);
      console.log(`   ⚠️  Database adherence: ${Math.round(adherencePercent)}% (4/10)`);
    }
  } else {
    sectionScore += 5; // Partial credit if no database analysis
    console.log('   ⚠️  No database fidelity data available (5/10)');
  }

  // Scale from 20 to 30 points (CRITICAL - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 30);
  validation.score += scaledScore;
  validation.gate_scores.recommendation_adherence = scaledScore;
  validation.details.recommendation_adherence = sectionDetails;
  console.log(`\n   Section A Score: ${scaledScore}/30 (CRITICAL - fidelity focus)`);
}

/**
 * Validate Implementation Quality (Section B - 30 points - CRITICAL)
 * Phase-aware: LEAD cares if work is good quality
 */
async function validateImplementationQuality(sd_id, gate2Data, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  // B1: Overall Gate 2 score (10 points)
  console.log('\n   [B1] Gate 2 Overall Score...');

  if (gate2Data?.score !== undefined) {
    const gate2Score = gate2Data.score;
    sectionDetails.gate2_score = gate2Score;

    if (gate2Score >= 90) {
      sectionScore += 10;
      console.log(`   ✅ Gate 2 score: ${gate2Score}/100 (excellent)`);
    } else if (gate2Score >= 80) {
      sectionScore += 8;
      console.log(`   ✅ Gate 2 score: ${gate2Score}/100 (good)`);
    } else if (gate2Score >= 70) {
      sectionScore += 6;
      validation.warnings.push(`[B1] Gate 2 score below 80: ${gate2Score}/100`);
      console.log(`   ⚠️  Gate 2 score: ${gate2Score}/100 (6/10)`);
    } else {
      sectionScore += 3;
      validation.warnings.push(`[B1] Low Gate 2 score: ${gate2Score}/100`);
      console.log(`   ⚠️  Gate 2 score: ${gate2Score}/100 (3/10)`);
    }
  } else {
    sectionScore += 5; // Partial credit if no Gate 2 data
    console.log('   ⚠️  No Gate 2 score available (5/10)');
  }

  // B2: Test coverage (10 points)
  console.log('\n   [B2] Test Coverage...');

  // Check for test results in handoff or CI/CD
  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata, deliverables')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]) {
    const metadata = handoffData[0].metadata || {};
    const deliverables = handoffData[0].deliverables || {};

    // Look for test coverage in metadata or deliverables
    const metadataStr = JSON.stringify(metadata).toLowerCase();
    const deliverablesStr = JSON.stringify(deliverables).toLowerCase();

    const hasTestCoverage = metadataStr.includes('test') ||
                             metadataStr.includes('coverage') ||
                             deliverablesStr.includes('test') ||
                             deliverablesStr.includes('e2e');

    if (hasTestCoverage) {
      sectionScore += 10;
      sectionDetails.test_coverage_documented = true;
      console.log('   ✅ Test coverage documented');
    } else {
      sectionScore += 5;
      validation.warnings.push('[B2] Test coverage not clearly documented');
      console.log('   ⚠️  Test coverage not clearly documented (5/10)');
    }
  } else {
    sectionScore += 5; // Partial credit
    console.log('   ⚠️  No EXEC→PLAN handoff found (5/10)');
  }

  // Scale from 20 to 30 points (CRITICAL - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 30);
  validation.score += scaledScore;
  validation.gate_scores.implementation_quality = scaledScore;
  validation.details.implementation_quality = sectionDetails;
  console.log(`\n   Section B Score: ${scaledScore}/30 (CRITICAL - quality focus)`);
}

/**
 * Validate Traceability Mapping (Section C - 25 points - MAJOR)
 * Phase-aware: Traceability important but not critical
 */
async function validateTraceabilityMapping(sd_id, designAnalysis, databaseAnalysis, validation, _supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [C] Traceability Mapping...');

  // C1: PRD → Implementation mapping (7 points)
  console.log('\n   [C1] PRD → Implementation Mapping...');

  // Check if git commits reference the SD
  try {
    const { stdout: gitLog } = await execAsync(
      `git log --all --grep="${sd_id}" --oneline`,
      { cwd: process.cwd(), timeout: 10000 }
    );

    const commitCount = gitLog.trim().split('\n').filter(Boolean).length;

    if (commitCount > 0) {
      sectionScore += 7;
      sectionDetails.commits_referencing_sd = commitCount;
      console.log(`   ✅ Found ${commitCount} commit(s) referencing ${sd_id}`);
    } else {
      sectionScore += 3;
      validation.warnings.push('[C1] No commits found referencing SD ID');
      console.log('   ⚠️  No commits reference SD ID (3/7)');
    }
  } catch (_error) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify git commits (3/7)');
  }

  // C2: Design analysis → Code mapping (7 points)
  console.log('\n   [C2] Design Analysis → Code Mapping...');

  if (designAnalysis) {
    // Check if handoff references design analysis
    const { data: handoffData } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables')
      .eq('sd_id', sd_id)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffData?.[0]?.deliverables) {
      const deliverablesStr = JSON.stringify(handoffData[0].deliverables).toLowerCase();
      const hasDesignMention = deliverablesStr.includes('design') ||
                                deliverablesStr.includes('ui') ||
                                deliverablesStr.includes('component');

      if (hasDesignMention) {
        sectionScore += 7;
        sectionDetails.design_code_mapping = true;
        console.log('   ✅ Design concepts mentioned in deliverables');
      } else {
        sectionScore += 4;
        validation.warnings.push('[C2] Design concepts not clearly mentioned in deliverables');
        console.log('   ⚠️  Design not clearly mentioned (4/7)');
      }
    } else {
      sectionScore += 4; // Partial credit
      console.log('   ⚠️  No deliverables found (4/7)');
    }
  } else {
    sectionScore += 4; // Partial credit if no design analysis
    console.log('   ⚠️  No design analysis to trace (4/7)');
  }

  // C3: Database analysis → Schema mapping (6 points)
  console.log('\n   [C3] Database Analysis → Schema Mapping...');

  if (databaseAnalysis) {
    // Check if handoff references database changes
    const { data: handoffData } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables')
      .eq('sd_id', sd_id)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffData?.[0]?.deliverables) {
      const deliverablesStr = JSON.stringify(handoffData[0].deliverables).toLowerCase();
      const hasDatabaseMention = deliverablesStr.includes('database') ||
                                  deliverablesStr.includes('migration') ||
                                  deliverablesStr.includes('schema') ||
                                  deliverablesStr.includes('table');

      if (hasDatabaseMention) {
        sectionScore += 6;
        sectionDetails.database_schema_mapping = true;
        console.log('   ✅ Database changes mentioned in deliverables');
      } else {
        sectionScore += 3;
        validation.warnings.push('[C3] Database changes not clearly mentioned in deliverables');
        console.log('   ⚠️  Database not clearly mentioned (3/6)');
      }
    } else {
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  No deliverables found (3/6)');
    }
  } else {
    sectionScore += 3; // Partial credit if no database analysis
    console.log('   ⚠️  No database analysis to trace (3/6)');
  }

  // Scale from 20 to 25 points (MAJOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 25);
  validation.score += scaledScore;
  validation.gate_scores.traceability_mapping = scaledScore;
  validation.details.traceability_mapping = sectionDetails;
  console.log(`\n   Section C Score: ${scaledScore}/25 (MAJOR - traceability)`);
}

/**
 * Validate Sub-Agent Effectiveness (Section D - 10 points - MINOR)
 * Phase-aware: Meta-analysis less important than actual results
 */
async function validateSubAgentEffectiveness(sd_id, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Sub-Agent Effectiveness...');

  // D1: Sub-agent execution metrics (10 points)
  console.log('\n   [D1] Sub-Agent Execution Metrics...');

  const { data: subAgentResults, error: subAgentError } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_name, execution_time_ms, status, created_at')
    .eq('sd_id', sd_id)
    .in('sub_agent_name', ['DESIGN', 'DATABASE', 'STORIES']);

  if (subAgentError) {
    sectionScore += 5;
    console.log('   ⚠️  Cannot fetch sub-agent results (5/10)');
  } else if (subAgentResults && subAgentResults.length > 0) {
    sectionScore += 10;
    sectionDetails.sub_agents_executed = subAgentResults.length;

    const totalTime = subAgentResults.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0);
    sectionDetails.total_execution_time_ms = totalTime;
    sectionDetails.sub_agent_details = subAgentResults.map(r => ({
      name: r.sub_agent_name,
      time_ms: r.execution_time_ms,
      status: r.status
    }));

    console.log(`   ✅ ${subAgentResults.length} sub-agents executed in ${totalTime}ms`);
  } else {
    sectionScore += 5;
    validation.warnings.push('[D1] No sub-agent execution records found');
    console.log('   ⚠️  No sub-agent records found (5/10)');
  }

  // D2: Recommendation quality (10 points)
  console.log('\n   [D2] Recommendation Quality...');

  // Check if sub-agent results have substantial output
  if (subAgentResults && subAgentResults.length > 0) {
    const { data: resultsWithOutput } = await supabase
      .from('sub_agent_execution_results')
      .select('result')
      .eq('sd_id', sd_id)
      .in('sub_agent_name', ['DESIGN', 'DATABASE']);

    if (resultsWithOutput && resultsWithOutput.length > 0) {
      let hasSubstantialOutput = false;

      for (const record of resultsWithOutput) {
        const resultStr = JSON.stringify(record.result || '');
        if (resultStr.length > 500) { // Substantial output
          hasSubstantialOutput = true;
          break;
        }
      }

      if (hasSubstantialOutput) {
        sectionScore += 10;
        sectionDetails.substantial_recommendations = true;
        console.log('   ✅ Sub-agents provided substantial recommendations');
      } else {
        sectionScore += 6;
        validation.warnings.push('[D2] Sub-agent recommendations appear minimal');
        console.log('   ⚠️  Minimal recommendations (6/10)');
      }
    } else {
      sectionScore += 6; // Partial credit
      console.log('   ⚠️  Cannot verify recommendation quality (6/10)');
    }
  } else {
    sectionScore += 5; // Partial credit
    console.log('   ⚠️  No sub-agent data to assess (5/10)');
  }

  // Scale from 20 to 10 points (MINOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 10);
  validation.score += scaledScore;
  validation.gate_scores.sub_agent_effectiveness = scaledScore;
  validation.details.sub_agent_effectiveness = sectionDetails;
  console.log(`\n   Section D Score: ${scaledScore}/10 (MINOR - meta-analysis)`);
}

/**
 * Validate Lessons Captured (Section E - 5 points - MINOR)
 * Phase-aware: Retrospective prep least important at handoff
 */
async function validateLessonsCaptured(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [E] Lessons Captured...');

  // E1: Check for retrospective preparation (10 points)
  console.log('\n   [E1] Retrospective Preparation...');

  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata, deliverables')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'PLAN-TO-LEAD')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.metadata) {
    const metadataStr = JSON.stringify(handoffData[0].metadata).toLowerCase();
    const hasRetroPrep = metadataStr.includes('lesson') ||
                         metadataStr.includes('retrospective') ||
                         metadataStr.includes('improvement');

    if (hasRetroPrep) {
      sectionScore += 10;
      sectionDetails.retrospective_prepared = true;
      console.log('   ✅ Retrospective preparation found in handoff');
    } else {
      sectionScore += 5;
      validation.warnings.push('[E1] No retrospective preparation detected');
      console.log('   ⚠️  No retrospective prep detected (5/10)');
    }
  } else {
    sectionScore += 5; // Partial credit
    console.log('   ⚠️  No PLAN→LEAD handoff found (5/10)');
  }

  // E2: Workflow effectiveness notes (10 points)
  console.log('\n   [E2] Workflow Effectiveness Notes...');

  // Check if EXEC→PLAN handoff mentions workflow effectiveness
  const { data: execHandoff } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata, deliverables')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (execHandoff?.[0]) {
    const combinedStr = JSON.stringify({
      ...execHandoff[0].metadata,
      ...execHandoff[0].deliverables
    }).toLowerCase();

    const hasWorkflowNotes = combinedStr.includes('workflow') ||
                              combinedStr.includes('process') ||
                              combinedStr.includes('pattern');

    if (hasWorkflowNotes) {
      sectionScore += 10;
      sectionDetails.workflow_effectiveness_noted = true;
      console.log('   ✅ Workflow effectiveness mentioned');
    } else {
      sectionScore += 5;
      validation.warnings.push('[E2] Workflow effectiveness not documented');
      console.log('   ⚠️  Workflow effectiveness not documented (5/10)');
    }
  } else {
    sectionScore += 5; // Partial credit
    console.log('   ⚠️  No EXEC→PLAN handoff to assess (5/10)');
  }

  // Scale from 20 to 5 points (MINOR - phase-aware weighting)
  const scaledScore = Math.round((sectionScore / 20) * 5);
  validation.score += scaledScore;
  validation.gate_scores.lessons_captured = scaledScore;
  validation.details.lessons_captured = sectionDetails;
  console.log(`\n   Section E Score: ${scaledScore}/5 (MINOR - retrospective prep)`);
}
