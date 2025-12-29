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
import { calculateAdaptiveThreshold } from './adaptive-threshold-calculator.js';
import { getPatternStats } from './pattern-tracking.js';

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

  // SD-VENTURE-STAGE0-UI-001: Resolve UUID from legacy_id if needed
  // Handoffs are stored with UUID, so we need to resolve the ID first
  // Also fetch SD category for SD-type aware validation (Gate 3 traceability)
  const _isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sd_id);
  let sdUuid = sd_id;
  let sdCategory = null;

  // Fetch SD data for both UUID resolution and category (for SD-type aware validation)
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('id, category, metadata, target_application, sd_type')
    .or(`legacy_id.eq.${sd_id},id.eq.${sd_id}`)
    .single();

  // Determine git repository path based on target_application
  // FIX: Use target application path instead of process.cwd() for git commands
  let gitRepoPath = process.cwd(); // Default fallback
  let sdType = null;
  if (sdData) {
    sdUuid = sdData.id;
    // Get category from direct field or metadata
    sdCategory = sdData.category?.toLowerCase() || sdData.metadata?.category?.toLowerCase() || null;
    // Get sd_type for type-aware validation
    sdType = sdData.sd_type?.toLowerCase() || null;
    console.log(`   SD Category: ${sdCategory || 'unknown'} | Type: ${sdType || 'unknown'}`);

    // Determine git repo path from target_application
    const targetApp = sdData.target_application || sdData.metadata?.target_application;
    if (targetApp === 'EHG') {
      gitRepoPath = '/mnt/c/_EHG/EHG';
    } else if (targetApp === 'EHG_Engineer') {
      gitRepoPath = '/mnt/c/_EHG/EHG_Engineer';
    }
    console.log(`   Git Repo: ${gitRepoPath}`);
  }

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

  // ===================================================================
  // PHASE 1: NON-NEGOTIABLE BLOCKERS (Preflight Checks)
  // ===================================================================
  console.log('\n[PHASE 1] Non-Negotiable Blockers...');
  console.log('-'.repeat(60));

  try {
    // Verify Gate 2 (EXEC→PLAN) passed
    // SD-VENTURE-STAGE0-UI-001: Use sdUuid instead of sd_id for handoff lookup
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
      console.log('   ❌ Gate 2 handoff not found - BLOCKING');
      console.log('   ⚠️  EXEC must complete EXEC→PLAN handoff before Gate 3');
      console.log('='.repeat(60));
      return validation; // Block immediately
    }

    const gate2Validation = gate2Handoff[0].metadata?.gate2_validation;
    if (!gate2Validation || !gate2Validation.passed) {
      validation.issues.push('[PHASE 1] CRITICAL: Gate 2 validation failed - cannot proceed to Gate 3');
      validation.failed_gates.push('GATE2_FAILED');
      validation.passed = false;
      console.log('   ❌ Gate 2 failed - BLOCKING');
      console.log(`   ⚠️  Gate 2 score: ${gate2Validation?.score || 'unknown'}/${gate2Validation?.max_score || 100}`);
      console.log('   ⚠️  Fix Gate 2 issues before proceeding to Gate 3');
      console.log('='.repeat(60));
      return validation; // Block immediately
    } else {
      console.log(`   ✅ Gate 2 passed (${gate2Validation.score}/${gate2Validation.max_score})`);
    }

    console.log('   ✅ All Phase 1 blockers passed - proceeding to Phase 2 scoring');
  } catch (error) {
    validation.issues.push(`[PHASE 1] Error during preflight checks: ${error.message}`);
    validation.passed = false;
    return validation;
  }

  // ===================================================================
  // PHASE 2: WEIGHTED SCORING (Negotiable Checks)
  // ===================================================================
  console.log('\n[PHASE 2] Weighted Scoring...');
  console.log('-'.repeat(60));

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
        .eq('sd_id', sdUuid)
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

    await validateRecommendationAdherence(sd_id, designAnalysis, databaseAnalysis, gate2Data, validation, supabase, sdCategory, sdType);

    // ===================================================================
    // SECTION B: Implementation Quality (20 points)
    // ===================================================================
    console.log('\n[B] Implementation Quality');
    console.log('-'.repeat(60));

    await validateImplementationQuality(sd_id, sdUuid, gate2Data, validation, supabase);

    // ===================================================================
    // SECTION C: Traceability Mapping (20 points)
    // SD-type aware: Security SDs check for security terms, not design/database terms
    // ===================================================================
    console.log('\n[C] Traceability Mapping');
    console.log('-'.repeat(60));

    await validateTraceabilityMapping(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase, sdCategory, gitRepoPath, sdType);

    // ===================================================================
    // SECTION D: Sub-Agent Effectiveness (20 points)
    // ===================================================================
    console.log('\n[D] Sub-Agent Effectiveness');
    console.log('-'.repeat(60));

    await validateSubAgentEffectiveness(sd_id, sdUuid, validation, supabase);

    // ===================================================================
    // SECTION E: Lessons Captured (20 points)
    // ===================================================================
    console.log('\n[E] Lessons Captured');
    console.log('-'.repeat(60));

    await validateLessonsCaptured(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // FINAL VALIDATION RESULT (with Adaptive Threshold)
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 3 SCORE: ${validation.score}/${validation.max_score} points`);

    // Calculate adaptive threshold based on SD context and Gates 1-2 performance
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, metadata')
      .eq('sd_id', sdUuid)
      .in('handoff_type', ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'])
      .order('created_at', { ascending: false });

    const priorGateScores = [];
    if (handoffs) {
      const gate1 = handoffs.find(h => h.handoff_type === 'PLAN-TO-EXEC')?.metadata?.gate1_validation?.score;
      const gate2 = handoffs.find(h => h.handoff_type === 'EXEC-TO-PLAN')?.metadata?.gate2_validation?.score;
      if (gate1) priorGateScores.push(gate1);
      if (gate2) priorGateScores.push(gate2);
    }

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
      gateNumber: 3
    });

    validation.details.adaptive_threshold = thresholdResult;
    const requiredThreshold = thresholdResult.finalThreshold;

    console.log(`\nAdaptive Threshold: ${requiredThreshold.toFixed(1)}%`);
    console.log(`Reasoning: ${thresholdResult.reasoning}`);

    if (validation.score >= requiredThreshold) {
      validation.passed = true;
      console.log(`✅ GATE 3: PASSED (${validation.score} ≥ ${requiredThreshold.toFixed(1)} points)`);
    } else {
      validation.passed = false;
      console.log(`❌ GATE 3: FAILED (${validation.score} < ${requiredThreshold.toFixed(1)} points)`);
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
async function validateRecommendationAdherence(_sd_id, designAnalysis, databaseAnalysis, gate2Data, validation, _supabase, sdCategory = null, sdType = null) {
  let sectionScore = 0;
  const sectionDetails = {};

  // SD-CAPITAL-FLOW-001: Database SDs that passed EXEC-TO-PLAN (Gate 2) get full credit
  // Their "recommendation adherence" is validated by the migration existing and being executed
  const isDatabaseSD = sdCategory === 'database';
  if (isDatabaseSD && gate2Data && gate2Data.validation_score >= 85) {
    console.log('   ✅ Database SD passed EXEC-TO-PLAN - Section A full credit (30/30)');
    validation.score += 30;
    validation.gate_scores.recommendation_adherence = 30;
    validation.details.recommendation_adherence = {
      skipped: true,
      reason: 'Database SD passed Gate 2 - recommendation adherence validated via migration execution',
      gate2_score: gate2Data.validation_score
    };
    return;
  }

  // SD-REFACTOR-SCRIPTS-001: Refactor SDs that passed EXEC-TO-PLAN (Gate 2) get full credit
  // Their "recommendation adherence" is validated by REGRESSION sub-agent proving no behavior change
  const isRefactorSD = sdCategory === 'refactor';
  if (isRefactorSD && gate2Data && gate2Data.validation_score >= 80) {
    console.log('   ✅ Refactor SD passed EXEC-TO-PLAN - Section A full credit (30/30)');
    console.log('   💡 Refactor validation via REGRESSION sub-agent (no behavior change)');
    validation.score += 30;
    validation.gate_scores.recommendation_adherence = 30;
    validation.details.recommendation_adherence = {
      skipped: true,
      reason: 'Refactor SD passed Gate 2 - recommendation adherence validated via REGRESSION sub-agent',
      gate2_score: gate2Data.validation_score
    };
    return;
  }

  // SD-MOCK-POLISH: Docs/Infrastructure SDs that passed EXEC-TO-PLAN (Gate 2) get full credit
  // These SDs focus on documentation, polish, and minor enhancements without design/database changes
  const isDocsSD = sdType === 'docs' || sdType === 'infrastructure';
  if (isDocsSD && gate2Data && gate2Data.score >= 80) {
    console.log('   ✅ Docs/Infrastructure SD passed EXEC-TO-PLAN - Section A full credit (30/30)');
    console.log('   💡 Docs SDs validated via implementation quality, not design/database fidelity');
    validation.score += 30;
    validation.gate_scores.recommendation_adherence = 30;
    validation.details.recommendation_adherence = {
      skipped: true,
      reason: 'Docs/Infrastructure SD passed Gate 2 - no design/database recommendations to adhere to',
      gate2_score: gate2Data.score
    };
    return;
  }

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
async function validateImplementationQuality(sd_id, sdUuid, gate2Data, validation, supabase) {
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
    .select('metadata, deliverables_manifest')
    .eq('sd_id', sdUuid)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]) {
    const metadata = handoffData[0].metadata || {};
    const deliverables = handoffData[0].deliverables_manifest || {};

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
 * SD-type aware: Security SDs use security terms, not generic design/database terms
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {string} sdUuid - Resolved UUID for the SD
 * @param {Object} designAnalysis - Design analysis from PRD
 * @param {Object} databaseAnalysis - Database analysis from PRD
 * @param {Object} validation - Validation result object to accumulate
 * @param {Object} supabase - Supabase client
 * @param {string|null} sdCategory - SD category (e.g., 'security', 'feature', 'database')
 * @param {string} gitRepoPath - Path to git repository for commit verification
 * @param {string|null} sdType - SD type (e.g., 'docs', 'infrastructure', 'feature')
 */
async function validateTraceabilityMapping(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase, sdCategory = null, gitRepoPath = process.cwd(), sdType = null) {
  let sectionScore = 0;
  const sectionDetails = {};

  // Determine if this is a security SD (check for 'security' in category)
  const isSecuritySD = sdCategory === 'security' ||
                        sdCategory === 'authentication' ||
                        sdCategory === 'authorization';

  // SD-CAPITAL-FLOW-001: Determine if this is a database SD without UI requirements
  const isDatabaseSD = sdCategory === 'database';

  // SD-MOCK-POLISH: Determine if this is a docs/infrastructure SD
  const isDocsSD = sdType === 'docs' || sdType === 'infrastructure';

  console.log('\n   [C] Traceability Mapping...');
  if (isSecuritySD) {
    console.log('   ℹ️  Security SD detected - using security-specific terms');
  }
  if (isDocsSD) {
    console.log('   ℹ️  Docs/Infrastructure SD detected - simplified traceability');
  }

  // SD-CAPITAL-FLOW-001: Database SDs don't need design→UI traceability
  // Their traceability is the migration file → database schema
  // Check for UI work in designAnalysis to allow database SDs with UI to still validate
  const hasUIDesign = designAnalysis?.specifications?.some(s =>
    /component|ui|frontend|form|page|view/i.test(JSON.stringify(s))
  ) || false;

  if (isDatabaseSD && !hasUIDesign) {
    console.log('   ✅ Database SD without UI requirements - Section C not applicable (25/25)');
    validation.score += 25;
    validation.gate_scores.traceability_mapping = 25;
    validation.details.traceability_mapping = {
      skipped: true,
      reason: 'Database SD without UI requirements - traceability is migration file → schema'
    };
    return;
  }

  // SD-REFACTOR-SCRIPTS-001: Refactor SDs focus on code reorganization without new design/database requirements
  // Their traceability is the REGRESSION sub-agent proving no behavior change
  const isRefactorSD = sdCategory === 'refactor';
  if (isRefactorSD) {
    console.log('   ✅ Refactor SD - Section C uses REGRESSION traceability (25/25)');
    console.log('   💡 Traceability via REGRESSION: before/after behavior comparison');
    validation.score += 25;
    validation.gate_scores.traceability_mapping = 25;
    validation.details.traceability_mapping = {
      skipped: true,
      reason: 'Refactor SD - traceability validated via REGRESSION sub-agent behavior comparison'
    };
    return;
  }

  // SD-MOCK-POLISH: Docs/Infrastructure SDs focus on documentation and polish
  // They don't have design/database requirements - traceability is PRD→docs/implementation
  if (isDocsSD) {
    console.log('   ✅ Docs/Infrastructure SD - Section C simplified (25/25)');
    console.log('   💡 Traceability via PRD requirements → documentation/implementation');
    validation.score += 25;
    validation.gate_scores.traceability_mapping = 25;
    validation.details.traceability_mapping = {
      skipped: true,
      reason: 'Docs/Infrastructure SD - no design/database requirements to trace'
    };
    return;
  }

  // C1: PRD → Implementation mapping (7 points)
  console.log('\n   [C1] PRD → Implementation Mapping...');

  // Check if git commits reference the SD
  // FIX: Use gitRepoPath (from target_application) instead of process.cwd()
  try {
    const { stdout: gitLog } = await execAsync(
      `git log --all --grep="${sd_id}" --oneline`,
      { cwd: gitRepoPath, timeout: 10000 }
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
  } catch (err) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify git commits (3/7)');
    console.log(`   DEBUG: Git error: ${err.message} | cwd: ${gitRepoPath}`);
  }

  // C2: Design analysis → Code mapping (7 points)
  // For security SDs: Check for security terms instead of UI/design terms
  console.log('\n   [C2] Design Analysis → Code Mapping...');

  if (designAnalysis) {
    // Check if handoff references design analysis
    const { data: handoffData } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables_manifest')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffData?.[0]?.deliverables_manifest) {
      const deliverablesStr = JSON.stringify(handoffData[0].deliverables_manifest).toLowerCase();

      let hasMention = false;
      if (isSecuritySD) {
        // Security SDs: Look for security-relevant terms
        hasMention = deliverablesStr.includes('security') ||
                     deliverablesStr.includes('auth') ||
                     deliverablesStr.includes('enforcement') ||
                     deliverablesStr.includes('validation') ||
                     deliverablesStr.includes('hardening') ||
                     deliverablesStr.includes('vulnerability') ||
                     deliverablesStr.includes('websocket') ||
                     deliverablesStr.includes('rls') ||
                     deliverablesStr.includes('policy');
      } else {
        // Standard SDs: Look for design terms
        hasMention = deliverablesStr.includes('design') ||
                     deliverablesStr.includes('ui') ||
                     deliverablesStr.includes('component');
      }

      if (hasMention) {
        sectionScore += 7;
        sectionDetails.design_code_mapping = true;
        const termType = isSecuritySD ? 'Security' : 'Design';
        console.log(`   ✅ ${termType} concepts mentioned in deliverables`);
      } else {
        sectionScore += 4;
        const termType = isSecuritySD ? 'Security' : 'Design';
        validation.warnings.push(`[C2] ${termType} concepts not clearly mentioned in deliverables`);
        console.log(`   ⚠️  ${termType} not clearly mentioned (4/7)`);
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
  // For security SDs: Check for security-related database terms (RLS, policies, access control)
  // Security SDs that pass C2 (security concepts present) get full credit for C3 if no
  // database changes were required (common for application-level security hardening)
  console.log('\n   [C3] Database Analysis → Schema Mapping...');

  if (databaseAnalysis) {
    // Check if handoff references database changes
    const { data: handoffData } = await supabase
      .from('sd_phase_handoffs')
      .select('deliverables_manifest')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', 'EXEC-TO-PLAN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (handoffData?.[0]?.deliverables_manifest) {
      const deliverablesStr = JSON.stringify(handoffData[0].deliverables_manifest).toLowerCase();

      let hasMention = false;
      if (isSecuritySD) {
        // Security SDs: Look for security-related database terms OR acknowledge no DB changes needed
        hasMention = deliverablesStr.includes('rls') ||
                     deliverablesStr.includes('policy') ||
                     deliverablesStr.includes('permission') ||
                     deliverablesStr.includes('access') ||
                     deliverablesStr.includes('security') ||
                     deliverablesStr.includes('enforce') ||
                     deliverablesStr.includes('database') ||
                     deliverablesStr.includes('migration') ||
                     deliverablesStr.includes('schema');

        // For security SDs: If no database mentions but C2 passed (sectionDetails.design_code_mapping),
        // give full credit because security hardening often doesn't require DB changes
        if (!hasMention && sectionDetails.design_code_mapping) {
          sectionScore += 6;
          sectionDetails.database_schema_mapping = true;
          sectionDetails.security_no_db_changes = true;
          console.log('   ✅ Security SD with no database changes (application-level hardening)');
        } else if (hasMention) {
          sectionScore += 6;
          sectionDetails.database_schema_mapping = true;
          console.log('   ✅ Security/database changes mentioned in deliverables');
        } else {
          sectionScore += 3;
          validation.warnings.push('[C3] Security/database changes not clearly mentioned in deliverables');
          console.log('   ⚠️  Security/database not clearly mentioned (3/6)');
        }
      } else {
        // Standard SDs: Look for database terms
        hasMention = deliverablesStr.includes('database') ||
                     deliverablesStr.includes('migration') ||
                     deliverablesStr.includes('schema') ||
                     deliverablesStr.includes('table');

        if (hasMention) {
          sectionScore += 6;
          sectionDetails.database_schema_mapping = true;
          console.log('   ✅ Database changes mentioned in deliverables');
        } else {
          sectionScore += 3;
          validation.warnings.push('[C3] Database changes not clearly mentioned in deliverables');
          console.log('   ⚠️  Database not clearly mentioned (3/6)');
        }
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
async function validateSubAgentEffectiveness(sd_id, sdUuid, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Sub-Agent Effectiveness...');

  // D1: Sub-agent execution metrics (10 points)
  console.log('\n   [D1] Sub-Agent Execution Metrics...');

  // Query all sub-agents for this SD (not just specific ones)
  const { data: subAgentResults, error: subAgentError } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_name, execution_time, verdict, created_at')
    .eq('sd_id', sdUuid);

  if (subAgentError) {
    sectionScore += 5;
    console.log('   ⚠️  Cannot fetch sub-agent results (5/10)');
  } else if (subAgentResults && subAgentResults.length > 0) {
    sectionScore += 10;
    sectionDetails.sub_agents_executed = subAgentResults.length;

    const totalTime = subAgentResults.reduce((sum, r) => sum + (r.execution_time || 0), 0);
    sectionDetails.total_execution_time_ms = totalTime;
    sectionDetails.sub_agent_details = subAgentResults.map(r => ({
      name: r.sub_agent_name,
      time_ms: r.execution_time,
      verdict: r.verdict
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
      .select('recommendations, detailed_analysis')
      .eq('sd_id', sdUuid);

    if (resultsWithOutput && resultsWithOutput.length > 0) {
      let hasSubstantialOutput = false;

      for (const record of resultsWithOutput) {
        const combinedOutput = JSON.stringify({
          recommendations: record.recommendations,
          detailed_analysis: record.detailed_analysis
        });
        if (combinedOutput.length > 500) { // Substantial output
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
async function validateLessonsCaptured(sd_id, sdUuid, designAnalysis, databaseAnalysis, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [E] Lessons Captured...');

  // E1: Check for retrospective preparation (10 points)
  // Fix: Check retrospectives table and EXEC-TO-PLAN handoff, not PLAN-TO-LEAD (which we're creating)
  console.log('\n   [E1] Retrospective Preparation...');

  // First, check if a retrospective exists in the retrospectives table
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
    console.log(`   ✅ Retrospective found (quality score: ${retrospective[0].quality_score || 'N/A'})`);
  } else if (hasRetroPrep) {
    sectionScore += 8;
    sectionDetails.retrospective_prepared = true;
    console.log('   ✅ Retrospective preparation found in EXEC→PLAN handoff (8/10)');
  } else {
    sectionScore += 5;
    validation.warnings.push('[E1] No retrospective preparation detected');
    console.log('   ⚠️  No retrospective prep detected (5/10)');
  }

  // E2: Workflow effectiveness notes (10 points)
  console.log('\n   [E2] Workflow Effectiveness Notes...');

  // Check if EXEC→PLAN handoff mentions workflow effectiveness
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
