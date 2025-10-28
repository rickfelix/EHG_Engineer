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

/**
 * Validate DESIGN→DATABASE workflow for PLAN→EXEC handoff
 *
 * Checks:
 * 1. DESIGN sub-agent executed
 * 2. DATABASE sub-agent executed
 * 3. DATABASE informed by DESIGN context
 * 4. STORIES sub-agent executed
 * 5. Schema documentation consulted
 * 6. PRD metadata complete
 * 7. Sub-agent execution order correct
 * 8. PRD created via add-prd-to-database.js
 * 9. User stories ≥80% implementation context coverage
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

  try {
    // ===================================================================
    // CHECK 1: DESIGN Sub-Agent Execution (11 points)
    // ===================================================================
    console.log('\n[1/9] Checking DESIGN sub-agent execution...');

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
    } else if (!designResults || designResults.length === 0) {
      validation.issues.push('DESIGN sub-agent has not been executed for this SD');
      validation.issues.push('Run: node lib/sub-agent-executor.js DESIGN ' + sd_id);
      validation.failed_gates.push('DESIGN_EXECUTION');
      console.log('   ❌ DESIGN sub-agent NOT executed');
    } else {
      const designResult = designResults[0];
      validation.score += 11;
      validation.gate_scores.design_execution = 11;
      validation.details.design_execution = {
        verdict: designResult.verdict,
        confidence: designResult.confidence,
        timestamp: designResult.created_at,
        workflow_analysis: designResult.metadata?.workflow_analysis
      };
      console.log(`   ✅ DESIGN sub-agent executed (verdict: ${designResult.verdict})`);

      // Check for DESIGN failures
      if (designResult.verdict === 'FAIL') {
        validation.warnings.push('DESIGN sub-agent verdict was FAIL - review workflow analysis');
      }
    }

    // ===================================================================
    // CHECK 2: DATABASE Sub-Agent Execution (11 points)
    // ===================================================================
    console.log('\n[2/9] Checking DATABASE sub-agent execution...');

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
    } else if (!databaseResults || databaseResults.length === 0) {
      validation.issues.push('DATABASE sub-agent has not been executed for this SD');
      validation.issues.push('Run: node lib/sub-agent-executor.js DATABASE ' + sd_id);
      validation.failed_gates.push('DATABASE_EXECUTION');
      console.log('   ❌ DATABASE sub-agent NOT executed');
    } else {
      const databaseResult = databaseResults[0];
      validation.score += 11;
      validation.gate_scores.database_execution = 11;
      validation.details.database_execution = {
        verdict: databaseResult.verdict,
        confidence: databaseResult.confidence,
        timestamp: databaseResult.created_at,
        schema_analysis: databaseResult.metadata?.schema_analysis
      };
      console.log(`   ✅ DATABASE sub-agent executed (verdict: ${databaseResult.verdict})`);

      // Check for DATABASE failures
      if (databaseResult.verdict === 'FAIL') {
        validation.warnings.push('DATABASE sub-agent verdict was FAIL - review schema analysis');
      }
    }

    // ===================================================================
    // CHECK 3: DATABASE Informed by DESIGN (11 points)
    // ===================================================================
    console.log('\n[3/9] Checking if DATABASE was informed by DESIGN context...');

    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata')
      .eq('directive_id', sd_id)
      .single();

    if (prdError) {
      validation.issues.push(`Failed to query PRD: ${prdError.message}`);
      validation.failed_gates.push('DESIGN_INFORMED_DATABASE');
    } else if (!prdData?.metadata?.database_analysis) {
      validation.issues.push('PRD metadata.database_analysis not found');
      validation.issues.push('DATABASE sub-agent may not have run during PRD creation');
      validation.failed_gates.push('DESIGN_INFORMED_DATABASE');
      console.log('   ❌ DATABASE analysis not found in PRD metadata');
    } else if (!prdData.metadata.database_analysis.design_informed) {
      validation.warnings.push('DATABASE analysis was not informed by DESIGN context');
      validation.warnings.push('Schema recommendations may not align with UI workflows');
      validation.score += 6; // Partial credit
      validation.gate_scores.design_informed_database = 6;
      console.log('   ⚠️  DATABASE analysis exists but NOT design-informed');
    } else {
      validation.score += 11;
      validation.gate_scores.design_informed_database = 11;
      validation.details.design_informed_database = {
        design_analysis_exists: !!prdData.metadata.design_analysis,
        database_informed: true,
        database_analysis_timestamp: prdData.metadata.database_analysis.generated_at
      };
      console.log('   ✅ DATABASE analysis informed by DESIGN context');
    }

    // ===================================================================
    // CHECK 4: STORIES Sub-Agent Execution (11 points)
    // ===================================================================
    console.log('\n[4/9] Checking STORIES sub-agent execution...');

    const { data: storiesResults, error: storiesError } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, confidence, metadata, created_at')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'STORIES')
      .order('created_at', { ascending: false })
      .limit(1);

    if (storiesError) {
      validation.issues.push(`Failed to query STORIES execution: ${storiesError.message}`);
      validation.failed_gates.push('STORIES_EXECUTION');
    } else if (!storiesResults || storiesResults.length === 0) {
      validation.warnings.push('STORIES sub-agent has not been executed (recommended but not blocking)');
      validation.warnings.push('Run: node lib/sub-agent-executor.js STORIES ' + sd_id);
      validation.score += 6; // Partial credit - not blocking
      validation.gate_scores.stories_execution = 6;
      console.log('   ⚠️  STORIES sub-agent NOT executed (recommended)');
    } else {
      const storiesResult = storiesResults[0];
      validation.score += 11;
      validation.gate_scores.stories_execution = 11;
      validation.details.stories_execution = {
        verdict: storiesResult.verdict,
        confidence: storiesResult.confidence,
        timestamp: storiesResult.created_at,
        stories_processed: storiesResult.metadata?.stories_processed
      };
      console.log(`   ✅ STORIES sub-agent executed (verdict: ${storiesResult.verdict})`);
    }

    // ===================================================================
    // CHECK 5: Schema Documentation Consulted (11 points)
    // ===================================================================
    console.log('\n[5/9] Checking if schema documentation was consulted...');

    if (prdData?.metadata?.database_analysis?.raw_analysis) {
      const dbAnalysis = prdData.metadata.database_analysis.raw_analysis;

      // Check if analysis mentions schema docs
      const mentionsSchemaDocs = dbAnalysis.includes('docs/reference/schema/') ||
                            dbAnalysis.includes('database-schema-overview') ||
                            dbAnalysis.includes('schema documentation');

      if (mentionsSchemaDocs) {
        validation.score += 11;
        validation.gate_scores.schema_docs_consulted = 11;
        validation.details.schema_docs_consulted = true;
        console.log('   ✅ Schema documentation consulted during DATABASE analysis');
      } else {
        validation.warnings.push('Schema documentation may not have been consulted');
        validation.warnings.push('DATABASE agent should reference docs/reference/schema/engineer/');
        validation.score += 6; // Partial credit
        validation.gate_scores.schema_docs_consulted = 6;
        console.log('   ⚠️  Schema documentation consultation not detected');
      }
    } else {
      validation.warnings.push('Cannot verify schema documentation consultation');
      validation.score += 6; // Partial credit
      validation.gate_scores.schema_docs_consulted = 6;
      console.log('   ⚠️  Cannot verify schema docs consultation');
    }

    // ===================================================================
    // CHECK 6: PRD Metadata Complete (11 points)
    // ===================================================================
    console.log('\n[6/9] Checking PRD metadata completeness...');

    const requiredMetadataFields = ['design_analysis', 'database_analysis'];
    const missingFields = requiredMetadataFields.filter(field => !prdData?.metadata?.[field]);

    if (missingFields.length === 0) {
      validation.score += 11;
      validation.gate_scores.prd_metadata_complete = 11;
      validation.details.prd_metadata = {
        complete: true,
        has_design_analysis: true,
        has_database_analysis: true
      };
      console.log('   ✅ PRD metadata complete (design_analysis + database_analysis)');
    } else {
      validation.issues.push(`PRD metadata missing fields: ${missingFields.join(', ')}`);
      validation.issues.push('Re-create PRD using: node scripts/add-prd-to-database.js ' + sd_id);
      validation.failed_gates.push('PRD_METADATA_COMPLETE');
      console.log(`   ❌ PRD metadata incomplete (missing: ${missingFields.join(', ')})`);
    }

    // ===================================================================
    // CHECK 7: Sub-Agent Execution Order (11 points)
    // ===================================================================
    console.log('\n[7/9] Checking sub-agent execution order...');

    if (designResults?.[0] && databaseResults?.[0]) {
      const designTime = new Date(designResults[0].created_at);
      const databaseTime = new Date(databaseResults[0].created_at);

      if (designTime < databaseTime) {
        validation.score += 11;
        validation.gate_scores.execution_order = 11;
        validation.details.execution_order = {
          correct: true,
          design_timestamp: designResults[0].created_at,
          database_timestamp: databaseResults[0].created_at
        };
        console.log('   ✅ Execution order correct: DESIGN → DATABASE');
      } else {
        validation.warnings.push('Sub-agent execution order may be incorrect');
        validation.warnings.push('Expected: DESIGN before DATABASE');
        validation.score += 6; // Partial credit
        validation.gate_scores.execution_order = 6;
        console.log('   ⚠️  Execution order: DATABASE before DESIGN (unexpected)');
      }
    } else {
      validation.warnings.push('Cannot verify execution order (missing sub-agent results)');
      validation.score += 6; // Partial credit if can't verify
      validation.gate_scores.execution_order = 6;
      console.log('   ⚠️  Cannot verify execution order');
    }

    // ===================================================================
    // CHECK 8: PRD Created via Script (11 points)
    // ===================================================================
    console.log('\n[8/9] Checking if PRD was created via add-prd-to-database.js...');

    // Check if PRD has the metadata signature from the script
    if (prdData?.metadata?.design_analysis || prdData?.metadata?.database_analysis) {
      validation.score += 11;
      validation.gate_scores.prd_created_via_script = 11;
      validation.details.prd_created_via_script = true;
      console.log('   ✅ PRD created via add-prd-to-database.js (has sub-agent metadata)');
    } else {
      validation.warnings.push('PRD may have been created manually (no sub-agent metadata)');
      validation.warnings.push('Always use: node scripts/add-prd-to-database.js');
      validation.score += 6; // Partial credit
      validation.gate_scores.prd_created_via_script = 6;
      console.log('   ⚠️  PRD may have been created manually');
    }

    // ===================================================================
    // CHECK 9: User Stories Implementation Context Coverage (12 points)
    // ===================================================================
    console.log('\n[9/9] Checking user stories implementation context coverage...');

    const { data: userStories, error: storiesQueryError } = await supabase
      .from('user_stories')
      .select('story_key, implementation_context, architecture_references, example_code_patterns, testing_scenarios')
      .eq('sd_id', sd_id);

    if (storiesQueryError) {
      validation.warnings.push(`Failed to query user stories: ${storiesQueryError.message}`);
      validation.score += 6; // Partial credit
      validation.gate_scores.stories_context_coverage = 6;
      console.log('   ⚠️  Cannot query user stories');
    } else if (!userStories || userStories.length === 0) {
      validation.warnings.push('No user stories found for this SD');
      validation.warnings.push('Run: node lib/sub-agent-executor.js STORIES ' + sd_id);
      validation.score += 6; // Partial credit
      validation.gate_scores.stories_context_coverage = 6;
      console.log('   ⚠️  No user stories found');
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
        validation.score += 12;
        validation.gate_scores.stories_context_coverage = 12;
        console.log(`   ✅ User stories context coverage: ${coverage.toFixed(1)}% (≥80% required)`);
      } else {
        validation.warnings.push(`User stories context coverage only ${coverage.toFixed(1)}% (≥80% required)`);
        validation.warnings.push('Run: node lib/sub-agent-executor.js STORIES ' + sd_id);
        validation.score += Math.round((coverage / 80) * 12); // Proportional credit
        validation.gate_scores.stories_context_coverage = Math.round((coverage / 80) * 12);
        console.log(`   ⚠️  User stories context coverage: ${coverage.toFixed(1)}% (below 80%)`);
      }
    }

    // ===================================================================
    // FINAL VALIDATION RESULT
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 1 SCORE: ${validation.score}/${validation.max_score} points`);

    if (validation.score >= 80) {
      validation.passed = true;
      console.log('✅ GATE 1: PASSED (≥80 points)');
    } else {
      validation.passed = false;
      console.log(`❌ GATE 1: FAILED (${validation.score} < 80 points)`);
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
 * @param {Object} sd - Strategic Directive object
 * @returns {boolean} True if validation required
 */
export function shouldValidateDesignDatabase(sd) {
  if (!sd) return false;

  // Check category field
  const hasDesignCategory = sd.category?.includes('design');
  const hasDatabaseCategory = sd.category?.includes('database');

  // Check scope/description for keywords
  const scope = (sd.scope || '').toLowerCase();
  const description = (sd.description || '').toLowerCase();

  const hasUIKeywords = scope.includes('ui') || scope.includes('ux') ||
                        description.includes('ui') || description.includes('component');
  const hasDatabaseKeywords = scope.includes('database') || scope.includes('schema') ||
                              description.includes('database') || description.includes('table');

  return (hasDesignCategory && hasDatabaseCategory) ||
         (hasUIKeywords && hasDatabaseKeywords);
}
