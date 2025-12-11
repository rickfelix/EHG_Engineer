/**
 * DESIGN→DATABASE Validation Gates - Gate 1 (PLAN→EXEC)
 *
 * Validates that DESIGN→DATABASE workflow was properly executed during PRD creation
 * before EXEC implementation begins.
 *
 * Integration: unified-handoff-system.js (PLAN→EXEC handoff)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

import { calculateAdaptiveThreshold } from './adaptive-threshold-calculator.js';
import { getPatternStats } from './pattern-tracking.js';

/**
 * Validate DESIGN→DATABASE workflow for PLAN→EXEC handoff
 * Phase-Aware Weighting System (Readiness Focus)
 *
 * Checks (CRITICAL = 70pts, MAJOR = 20pts, MINOR = 10pts):
 * 1. DESIGN sub-agent executed (20 pts) - CRITICAL
 * 2. DATABASE sub-agent executed (20 pts) - CRITICAL
 * 3. DATABASE informed by DESIGN (15 pts, partial 6) - CRITICAL
 * 4. STORIES executed (3 pts, partial 2) - MINOR
 * 5. Schema docs consulted (2 pts, partial 1) - MINOR
 * 6. PRD metadata complete (15 pts) - CRITICAL
 * 7. Execution order correct (5 pts, partial 3) - MINOR
 * 8. PRD via script (10 pts, partial 5) - MAJOR
 * 9. User stories ≥80% context (10 pts, proportional) - MAJOR
 *
 * Total: 100 points
 * Philosophy: Front-load critical prerequisites before implementation
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate1PlanToExec(sd_id, supabase) {
  console.log('\n🚪 GATE 1: DESIGN→DATABASE Workflow Validation (PLAN→EXEC)');
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

  // ===================================================================
  // PHASE 1: NON-NEGOTIABLE BLOCKERS (Preflight Checks)
  // ===================================================================
  console.log('\n[PHASE 1] Non-Negotiable Blockers...');
  console.log('-'.repeat(60));

  try {
    // Verify DESIGN sub-agent executed
    const { data: designCheck } = await supabase
      .from('sub_agent_execution_results')
      .select('id')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'DESIGN')
      .limit(1);

    if (!designCheck || designCheck.length === 0) {
      validation.issues.push('[PHASE 1] CRITICAL: DESIGN sub-agent not executed');
      validation.failed_gates.push('DESIGN_EXECUTION');
      validation.passed = false;
      console.log('   ❌ DESIGN sub-agent NOT executed - BLOCKING');
      console.log('   ⚠️  Run: node lib/sub-agent-executor.js DESIGN ' + sd_id);
      console.log('='.repeat(60));
      return validation; // Block immediately
    } else {
      console.log('   ✅ DESIGN sub-agent executed');
    }

    // Verify DATABASE sub-agent executed
    const { data: databaseCheck } = await supabase
      .from('sub_agent_execution_results')
      .select('id')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'DATABASE')
      .limit(1);

    if (!databaseCheck || databaseCheck.length === 0) {
      validation.issues.push('[PHASE 1] CRITICAL: DATABASE sub-agent not executed');
      validation.failed_gates.push('DATABASE_EXECUTION');
      validation.passed = false;
      console.log('   ❌ DATABASE sub-agent NOT executed - BLOCKING');
      console.log('   ⚠️  Run: node lib/sub-agent-executor.js DATABASE ' + sd_id);
      console.log('='.repeat(60));
      return validation; // Block immediately
    } else {
      console.log('   ✅ DATABASE sub-agent executed');
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
    // ===================================================================
    // CHECK 1: DESIGN Sub-Agent Execution (20 points - CRITICAL)
    // ===================================================================
    console.log('\n[1/9] Checking DESIGN sub-agent execution (CRITICAL)...');

    const { data: designResults, error: designError } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, confidence, metadata, created_at')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'DESIGN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (designError) {
      validation.issues.push(`Failed to query DESIGN execution: ${designError.message}`);
      validation.failed_gates.push('DESIGN_EXECUTION');
      console.log('   ❌ DESIGN sub-agent query failed (0/20)');
    } else if (!designResults || designResults.length === 0) {
      validation.issues.push('CRITICAL: DESIGN sub-agent has not been executed for this SD');
      validation.issues.push('Run: node lib/sub-agent-executor.js DESIGN ' + sd_id);
      validation.failed_gates.push('DESIGN_EXECUTION');
      console.log('   ❌ DESIGN sub-agent NOT executed - BLOCKING (0/20)');
    } else {
      const designResult = designResults[0];
      validation.score += 20;
      validation.gate_scores.design_execution = 20;
      validation.details.design_execution = {
        verdict: designResult.verdict,
        confidence: designResult.confidence,
        timestamp: designResult.created_at,
        workflow_analysis: designResult.metadata?.workflow_analysis
      };
      console.log(`   ✅ DESIGN sub-agent executed (verdict: ${designResult.verdict}) (20/20)`);

      // Check for DESIGN failures
      if (designResult.verdict === 'FAIL') {
        validation.warnings.push('DESIGN sub-agent verdict was FAIL - review workflow analysis');
      }
    }

    // ===================================================================
    // CHECK 2: DATABASE Sub-Agent Execution (20 points - CRITICAL)
    // ===================================================================
    console.log('\n[2/9] Checking DATABASE sub-agent execution (CRITICAL)...');

    const { data: databaseResults, error: databaseError } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, confidence, metadata, created_at')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'DATABASE')
      .order('created_at', { ascending: false })
      .limit(1);

    if (databaseError) {
      validation.issues.push(`Failed to query DATABASE execution: ${databaseError.message}`);
      validation.failed_gates.push('DATABASE_EXECUTION');
      console.log('   ❌ DATABASE sub-agent query failed (0/20)');
    } else if (!databaseResults || databaseResults.length === 0) {
      validation.issues.push('CRITICAL: DATABASE sub-agent has not been executed for this SD');
      validation.issues.push('Run: node lib/sub-agent-executor.js DATABASE ' + sd_id);
      validation.failed_gates.push('DATABASE_EXECUTION');
      console.log('   ❌ DATABASE sub-agent NOT executed - BLOCKING (0/20)');
    } else {
      const databaseResult = databaseResults[0];
      validation.score += 20;
      validation.gate_scores.database_execution = 20;
      validation.details.database_execution = {
        verdict: databaseResult.verdict,
        confidence: databaseResult.confidence,
        timestamp: databaseResult.created_at,
        schema_analysis: databaseResult.metadata?.schema_analysis
      };
      console.log(`   ✅ DATABASE sub-agent executed (verdict: ${databaseResult.verdict}) (20/20)`);

      // Check for DATABASE failures
      if (databaseResult.verdict === 'FAIL') {
        validation.warnings.push('DATABASE sub-agent verdict was FAIL - review schema analysis');
      }
    }

    // ===================================================================
    // CHECK 3: DATABASE Informed by DESIGN (15 points, partial 6 - CRITICAL)
    // ===================================================================
    console.log('\n[3/9] Checking if DATABASE was informed by DESIGN context (CRITICAL)...');

    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata')
      .eq('directive_id', sd_id)
      .single();

    if (prdError) {
      validation.issues.push(`Failed to query PRD: ${prdError.message}`);
      validation.failed_gates.push('DESIGN_INFORMED_DATABASE');
      console.log('   ❌ PRD query failed (0/15)');
    } else if (!prdData?.metadata?.database_analysis) {
      validation.issues.push('CRITICAL: PRD metadata.database_analysis not found');
      validation.issues.push('DATABASE sub-agent may not have run during PRD creation');
      validation.failed_gates.push('DESIGN_INFORMED_DATABASE');
      console.log('   ❌ DATABASE analysis not found in PRD metadata (0/15)');
    } else if (!prdData.metadata.database_analysis.design_informed) {
      validation.warnings.push('DATABASE analysis was not informed by DESIGN context');
      validation.warnings.push('Schema recommendations may not align with UI workflows');
      validation.score += 6; // Partial credit
      validation.gate_scores.design_informed_database = 6;
      console.log('   ⚠️  DATABASE analysis exists but NOT design-informed (6/15)');
    } else {
      validation.score += 15;
      validation.gate_scores.design_informed_database = 15;
      validation.details.design_informed_database = {
        design_analysis_exists: !!prdData.metadata.design_analysis,
        database_informed: true,
        database_analysis_timestamp: prdData.metadata.database_analysis.generated_at
      };
      console.log('   ✅ DATABASE analysis informed by DESIGN context (15/15)');
    }

    // ===================================================================
    // CHECK 4: STORIES Sub-Agent Execution (3 points, partial 2 - MINOR)
    // ===================================================================
    console.log('\n[4/9] Checking STORIES sub-agent execution (MINOR)...');

    const { data: storiesResults, error: storiesError } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, confidence, metadata, created_at')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'STORIES')
      .order('created_at', { ascending: false })
      .limit(1);

    if (storiesError) {
      validation.warnings.push(`Failed to query STORIES execution: ${storiesError.message}`);
      validation.score += 2; // Partial credit on error (MINOR check)
      validation.gate_scores.stories_execution = 2;
      console.log('   ⚠️  STORIES query failed - partial credit (2/3)');
    } else if (!storiesResults || storiesResults.length === 0) {
      validation.warnings.push('STORIES sub-agent has not been executed (recommended but not blocking)');
      validation.warnings.push('Run: node lib/sub-agent-executor.js STORIES ' + sd_id);
      validation.score += 2; // Partial credit - not blocking (MINOR)
      validation.gate_scores.stories_execution = 2;
      console.log('   ⚠️  STORIES sub-agent NOT executed - recommended (2/3)');
    } else {
      const storiesResult = storiesResults[0];
      validation.score += 3;
      validation.gate_scores.stories_execution = 3;
      validation.details.stories_execution = {
        verdict: storiesResult.verdict,
        confidence: storiesResult.confidence,
        timestamp: storiesResult.created_at,
        stories_processed: storiesResult.metadata?.stories_processed
      };
      console.log(`   ✅ STORIES sub-agent executed (verdict: ${storiesResult.verdict}) (3/3)`);
    }

    // ===================================================================
    // CHECK 5: Schema Documentation Consulted (2 points, partial 1 - MINOR)
    // ===================================================================
    console.log('\n[5/9] Checking if schema documentation was consulted (MINOR)...');

    if (prdData?.metadata?.database_analysis?.raw_analysis) {
      const dbAnalysis = prdData.metadata.database_analysis.raw_analysis;

      // Check if analysis mentions schema docs
      const mentionsSchemaDocs = dbAnalysis.includes('docs/reference/schema/') ||
                            dbAnalysis.includes('database-schema-overview') ||
                            dbAnalysis.includes('schema documentation');

      if (mentionsSchemaDocs) {
        validation.score += 2;
        validation.gate_scores.schema_docs_consulted = 2;
        validation.details.schema_docs_consulted = true;
        console.log('   ✅ Schema documentation consulted during DATABASE analysis (2/2)');
      } else {
        validation.warnings.push('Schema documentation may not have been consulted');
        validation.warnings.push('DATABASE agent should reference docs/reference/schema/engineer/');
        validation.score += 1; // Partial credit (MINOR)
        validation.gate_scores.schema_docs_consulted = 1;
        console.log('   ⚠️  Schema documentation consultation not detected (1/2)');
      }
    } else {
      validation.warnings.push('Cannot verify schema documentation consultation');
      validation.score += 1; // Partial credit (MINOR)
      validation.gate_scores.schema_docs_consulted = 1;
      console.log('   ⚠️  Cannot verify schema docs consultation (1/2)');
    }

    // ===================================================================
    // CHECK 6: PRD Metadata Complete (15 points - CRITICAL)
    // ===================================================================
    console.log('\n[6/9] Checking PRD metadata completeness (CRITICAL)...');

    const requiredMetadataFields = ['design_analysis', 'database_analysis'];
    const missingFields = requiredMetadataFields.filter(field => !prdData?.metadata?.[field]);

    if (missingFields.length === 0) {
      validation.score += 15;
      validation.gate_scores.prd_metadata_complete = 15;
      validation.details.prd_metadata = {
        complete: true,
        has_design_analysis: true,
        has_database_analysis: true
      };
      console.log('   ✅ PRD metadata complete (design_analysis + database_analysis) (15/15)');
    } else {
      validation.issues.push(`CRITICAL: PRD metadata missing fields: ${missingFields.join(', ')}`);
      validation.issues.push('Re-create PRD using: node scripts/add-prd-to-database.js ' + sd_id);
      validation.failed_gates.push('PRD_METADATA_COMPLETE');
      console.log(`   ❌ PRD metadata incomplete (missing: ${missingFields.join(', ')}) (0/15)`);
    }

    // ===================================================================
    // CHECK 7: Sub-Agent Execution Order (5 points, partial 3 - MINOR)
    // ===================================================================
    console.log('\n[7/9] Checking sub-agent execution order (MINOR)...');

    if (designResults?.[0] && databaseResults?.[0]) {
      const designTime = new Date(designResults[0].created_at);
      const databaseTime = new Date(databaseResults[0].created_at);

      if (designTime < databaseTime) {
        validation.score += 5;
        validation.gate_scores.execution_order = 5;
        validation.details.execution_order = {
          correct: true,
          design_timestamp: designResults[0].created_at,
          database_timestamp: databaseResults[0].created_at
        };
        console.log('   ✅ Execution order correct: DESIGN → DATABASE (5/5)');
      } else {
        validation.warnings.push('Sub-agent execution order may be incorrect');
        validation.warnings.push('Expected: DESIGN before DATABASE');
        validation.score += 3; // Partial credit (MINOR)
        validation.gate_scores.execution_order = 3;
        console.log('   ⚠️  Execution order: DATABASE before DESIGN - unexpected (3/5)');
      }
    } else {
      validation.warnings.push('Cannot verify execution order (missing sub-agent results)');
      validation.score += 3; // Partial credit if can't verify (MINOR)
      validation.gate_scores.execution_order = 3;
      console.log('   ⚠️  Cannot verify execution order (3/5)');
    }

    // ===================================================================
    // CHECK 8: PRD Created via Script (10 points, partial 5 - MAJOR)
    // ===================================================================
    console.log('\n[8/9] Checking if PRD was created via add-prd-to-database.js (MAJOR)...');

    // Check if PRD has the metadata signature from the script
    if (prdData?.metadata?.design_analysis || prdData?.metadata?.database_analysis) {
      validation.score += 10;
      validation.gate_scores.prd_created_via_script = 10;
      validation.details.prd_created_via_script = true;
      console.log('   ✅ PRD created via add-prd-to-database.js (has sub-agent metadata) (10/10)');
    } else {
      validation.warnings.push('PRD may have been created manually (no sub-agent metadata)');
      validation.warnings.push('Always use: node scripts/add-prd-to-database.js');
      validation.score += 5; // Partial credit (MAJOR)
      validation.gate_scores.prd_created_via_script = 5;
      console.log('   ⚠️  PRD may have been created manually (5/10)');
    }

    // ===================================================================
    // CHECK 9: User Stories Implementation Context Coverage (10 points, proportional - MAJOR)
    // ===================================================================
    console.log('\n[9/9] Checking user stories implementation context coverage (MAJOR)...');

    const { data: userStories, error: storiesQueryError } = await supabase
      .from('user_stories')
      .select('story_key, implementation_context, architecture_references, example_code_patterns, testing_scenarios')
      .eq('sd_id', sd_id);

    if (storiesQueryError) {
      validation.warnings.push(`Failed to query user stories: ${storiesQueryError.message}`);
      validation.score += 5; // Partial credit (MAJOR)
      validation.gate_scores.stories_context_coverage = 5;
      console.log('   ⚠️  Cannot query user stories (5/10)');
    } else if (!userStories || userStories.length === 0) {
      validation.warnings.push('No user stories found for this SD');
      validation.warnings.push('Run: node lib/sub-agent-executor.js STORIES ' + sd_id);
      validation.score += 5; // Partial credit (MAJOR)
      validation.gate_scores.stories_context_coverage = 5;
      console.log('   ⚠️  No user stories found (5/10)');
    } else {
      // Calculate coverage
      const storiesWithContext = userStories.filter(s =>
        s.implementation_context && s.implementation_context.length > 50
      ).length;
      const coverage = (storiesWithContext / userStories.length) * 100;

      validation.details.stories_context_coverage = {
        total_stories: userStories.length,
        stories_with_context: storiesWithContext,
        coverage_percentage: coverage.toFixed(1)
      };

      if (coverage >= 80) {
        validation.score += 10;
        validation.gate_scores.stories_context_coverage = 10;
        console.log(`   ✅ User stories context coverage: ${coverage.toFixed(1)}% (≥80% required) (10/10)`);
      } else {
        validation.warnings.push(`User stories context coverage only ${coverage.toFixed(1)}% (≥80% required)`);
        validation.warnings.push('Run: node lib/sub-agent-executor.js STORIES ' + sd_id);
        const proportionalScore = Math.round((coverage / 80) * 10); // Proportional credit
        validation.score += proportionalScore;
        validation.gate_scores.stories_context_coverage = proportionalScore;
        console.log(`   ⚠️  User stories context coverage: ${coverage.toFixed(1)}% (below 80%) (${proportionalScore}/10)`);
      }
    }

    // ===================================================================
    // FINAL VALIDATION RESULT (with Adaptive Threshold)
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 1 SCORE: ${validation.score}/${validation.max_score} points`);

    // Calculate adaptive threshold based on SD context
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sd_id)
      .single();

    // Fetch pattern statistics for maturity bonus
    const patternStats = await getPatternStats(sdData, supabase);

    const thresholdResult = calculateAdaptiveThreshold({
      sd: sdData,
      priorGateScores: [], // Gate 1 has no prior gates
      patternStats,
      gateNumber: 1
    });

    validation.details.adaptive_threshold = thresholdResult;
    const requiredThreshold = thresholdResult.finalThreshold;

    console.log(`\nAdaptive Threshold: ${requiredThreshold.toFixed(1)}%`);
    console.log(`Reasoning: ${thresholdResult.reasoning}`);

    if (validation.score >= requiredThreshold) {
      validation.passed = true;
      console.log(`✅ GATE 1: PASSED (${validation.score} ≥ ${requiredThreshold.toFixed(1)} points)`);
    } else {
      validation.passed = false;
      console.log(`❌ GATE 1: FAILED (${validation.score} < ${requiredThreshold.toFixed(1)} points)`);
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
    console.error('\n❌ GATE 1 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

/**
 * Helper: Check if SD requires DESIGN→DATABASE validation
 *
 * Infrastructure SDs (sd_type='infrastructure') are exempt from Gate 3/4 validation
 * because they focus on building components/tooling rather than feature workflows.
 * These SDs may mention UI/schema keywords but don't have the DESIGN→DATABASE
 * sub-agent execution workflow that Gates 3/4 validate.
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if validation required
 */
export function shouldValidateDesignDatabase(sd) {
  if (!sd) return false;

  // Infrastructure SDs are exempt - they build tooling, not feature workflows
  // These SDs may mention UI/schema keywords but don't follow DESIGN→DATABASE workflow
  if (sd.sd_type === 'infrastructure' || sd.category === 'infrastructure') {
    return false;
  }

  // Check category field
  const hasDesignCategory = sd.category?.includes('design');
  const hasDatabaseCategory = sd.category?.includes('database');

  // Check scope/description for keywords (word boundary regex to avoid false positives)
  const scope = (sd.scope || '').toLowerCase();
  const description = (sd.description || '').toLowerCase();

  const hasUIKeywords = /\b(ui|ux|component)\b/i.test(scope) ||
                        /\b(ui|ux|component)\b/i.test(description);
  const hasDatabaseKeywords = /\b(database|schema|table)\b/i.test(scope) ||
                              /\b(database|schema|table)\b/i.test(description);

  return (hasDesignCategory && hasDatabaseCategory) ||
         (hasUIKeywords && hasDatabaseKeywords);
}
