/**
 * RETRO Sub-Agent (Continuous Improvement Coach)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Generate comprehensive retrospectives and capture learnings
 * Code: RETRO
 * Priority: 85
 *
 * Philosophy: "Every SD is a learning opportunity. Capture it."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { batchQuery } from '../utils/batch-db-operations.js';
// LEO v4.3.4: Unified test evidence functions
import { getLatestTestEvidence, getStoryTestCoverage } from '../../scripts/lib/test-evidence-ingest.js';

dotenv.config();

// RETRO requires SERVICE_ROLE_KEY for write access to retrospectives table
// RLS policies correctly restrict ANON_KEY to read-only (SD-FOUND-SAFETY-002)
// Now using standardized createSupabaseServiceClient() which handles env var lookup

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute RETRO sub-agent
 * Generates comprehensive retrospective
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Retrospective generation results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔄 Starting RETRO for ${sdId}...`);
  console.log('   Continuous Improvement Coach - Retrospective Generation');

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  // RETRO needs write access to retrospectives table which has RLS restrictions
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      sd_metadata: null,
      prd_data: null,
      handoffs: null,
      sub_agent_results: null,
      retrospective: null
    },
    options
  };

  try {
    // Phase 1: Gather SD metadata
    console.log('\n📊 Phase 1: Gathering SD metadata...');
    const sdData = await gatherSDMetadata(sdId);
    results.findings.sd_metadata = sdData;

    if (!sdData.found) {
      console.log(`   ❌ SD ${sdId} not found`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `SD ${sdId} not found in database`,
        recommendation: 'Verify SD ID is correct'
      });
      results.verdict = 'BLOCKED';
      return results;
    }

    console.log(`   ✅ SD: ${sdData.title} (${sdData.status})`);

    // Phase 1.5: Check if retrospective already exists
    console.log('\n🔍 Phase 1.5: Checking for existing retrospective...');
    const existingRetro = await checkExistingRetrospective(sdId);

    if (existingRetro.found) {
      console.log(`   ✅ Retrospective already exists: ${existingRetro.id}`);
      console.log(`      Quality Score: ${existingRetro.quality_score}/100`);
      console.log(`      Status: ${existingRetro.status}`);

      results.findings.retrospective = {
        id: existingRetro.id,
        already_exists: true,
        ...existingRetro
      };
      results.recommendations.push(
        `Retrospective already exists: ${existingRetro.id}`,
        'No action needed - retrospective previously generated'
      );

      console.log(`\n🏁 RETRO Complete: ${results.verdict} (${results.confidence}% confidence)`);
      return results;
    }

    console.log('   ℹ️  No existing retrospective found - will generate new one');

    // Phases 2-4: Gather all data in parallel (Performance Enhancement)
    console.log('\n⚡ Phases 2-4: Gathering PRD, handoffs, and sub-agent results in parallel...');

    const batchResults = await batchQuery([
      {
        name: 'prd',
        table: 'product_requirements_v2',
        select: '*',
        filters: { directive_id: sdId },
        options: { maybeSingle: true }
      },
      {
        name: 'handoffs',
        table: 'sd_phase_handoffs',
        select: '*',
        filters: { sd_id: sdId },
        options: { order: { column: 'created_at', ascending: true } }
      },
      {
        name: 'sub_agent_results',
        table: 'sub_agent_execution_results',
        select: '*',
        filters: { sd_id: sdId },
        options: { order: { column: 'created_at', ascending: true } }
      }
    ]);

    console.log(`   ⏱️  Parallel queries completed in ${batchResults.timing.total_ms}ms`);

    // Process PRD data (Phase 2)
    const prdData = batchResults.data.prd
      ? { found: true, prd: batchResults.data.prd }
      : { found: false, error: batchResults.errors.prd };
    results.findings.prd_data = prdData;

    if (prdData.found) {
      console.log(`   ✅ PRD found: ${prdData.prd.title}`);
    } else {
      console.log('   ⚠️  No PRD found');
    }

    // Process handoffs (Phase 3)
    const handoffsList = batchResults.data.handoffs || [];
    const handoffs = {
      found: true,
      count: handoffsList.length,
      handoffs: handoffsList
    };
    results.findings.handoffs = handoffs;

    console.log(`   ✅ Found ${handoffs.count} handoff(s)`);
    if (handoffs.count > 0) {
      const types = [...new Set(handoffs.handoffs.map(h => h.handoff_type))];
      console.log(`      Types: ${types.join(', ')}`);
    }

    // Process sub-agent results (Phase 4)
    const subAgentList = batchResults.data.sub_agent_results || [];
    const subAgentResults = {
      found: true,
      count: subAgentList.length,
      results: subAgentList
    };
    results.findings.sub_agent_results = subAgentResults;

    console.log(`   ✅ Found ${subAgentResults.count} sub-agent execution(s)`);
    if (subAgentResults.count > 0) {
      const agents = [...new Set(subAgentResults.results.map(r => r.sub_agent_code))];
      console.log(`      Agents: ${agents.join(', ')}`);
    }

    // LEO v4.3.4: Phase 4.5 - Gather test evidence from unified schema
    console.log('\n🧪 Phase 4.5: Gathering test evidence (LEO v4.3.4)...');
    let testEvidence = null;
    try {
      testEvidence = await getLatestTestEvidence(sdId);
      if (testEvidence) {
        console.log(`   ✅ Test evidence found: ${testEvidence.verdict} (${testEvidence.pass_rate}%)`);
        console.log(`      Run type: ${testEvidence.run_type}`);
        console.log(`      Freshness: ${testEvidence.freshness_status}`);
        results.findings.test_evidence = testEvidence;
      } else {
        console.log('   ℹ️  No unified test evidence found');
      }

      // Also get story-level coverage
      const storyCoverage = await getStoryTestCoverage(sdId);
      if (storyCoverage.total_stories > 0) {
        console.log(`   📊 Story coverage: ${storyCoverage.passing_count}/${storyCoverage.total_stories} stories passing`);
        results.findings.story_coverage = storyCoverage;
      }
    } catch (testError) {
      console.log(`   ⚠️  Could not retrieve test evidence: ${testError.message}`);
    }

    // Phase 5: Generate retrospective
    console.log('\n📝 Phase 5: Generating retrospective...');
    const retrospective = generateRetrospective(sdData, prdData, handoffs, subAgentResults, options, testEvidence);
    results.findings.retrospective = retrospective;

    console.log('   ✅ Retrospective generated');
    console.log(`      Quality Score: ${retrospective.quality_score}/100`);
    console.log(`      Team Satisfaction: ${retrospective.team_satisfaction}/10`);
    console.log(`      Key Learnings: ${retrospective.key_learnings.length}`);

    // Phase 6: Store retrospective (if not dry-run)
    if (!options.dry_run) {
      console.log('\n💾 Phase 6: Storing retrospective...');
      const stored = await storeRetrospective(retrospective);

      if (stored.success) {
        console.log(`   ✅ Retrospective stored: ${stored.id}`);
        results.findings.retrospective.id = stored.id;
        results.recommendations.push(
          `Retrospective generated and stored: ${stored.id}`,
          'Review retrospective for insights',
          'Apply learnings to future SDs'
        );
      } else {
        console.log(`   ❌ Failed to store retrospective: ${stored.error}`);
        results.warnings.push({
          severity: 'HIGH',
          issue: 'Could not store retrospective in database',
          recommendation: 'Manually save retrospective data',
          error: stored.error
        });
        if (results.confidence > 80) results.confidence = 80;
      }
    } else {
      console.log('\n⏭️  Phase 6: Skipped (dry-run mode)');
      results.recommendations.push(
        'Retrospective generated (dry-run mode - not stored)',
        'Remove --dry-run flag to store in database'
      );
    }

    console.log(`\n🏁 RETRO Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error('\n❌ RETRO error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'RETRO sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

/**
 * Check if retrospective already exists for this SD
 */
async function checkExistingRetrospective(sdId) {
  const { data: retro, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      found: false,
      error: error.message
    };
  }

  if (!retro) {
    return {
      found: false
    };
  }

  return {
    found: true,
    ...retro
  };
}

/**
 * Gather SD metadata
 */
async function gatherSDMetadata(sdId) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    return {
      found: false,
      error: error?.message
    };
  }

  return {
    found: true,
    ...sd
  };
}

/**
 * Gather PRD data (unused - replaced by batchQuery in gatherAllSDData)
 */
async function _gatherPRDData(sdId) {
  const { data: prd, error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', sdId)
    .single();

  if (error || !prd) {
    return {
      found: false,
      error: error?.message
    };
  }

  return {
    found: true,
    prd: prd
  };
}

/**
 * Analyze handoffs (unused - replaced by batchQuery in gatherAllSDData)
 */
async function _analyzeHandoffs(sdId) {
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      found: false,
      count: 0,
      handoffs: [],
      error: error.message
    };
  }

  return {
    found: true,
    count: handoffs?.length || 0,
    handoffs: handoffs || []
  };
}

/**
 * Analyze sub-agent results (unused - replaced by batchQuery in gatherAllSDData)
 */
async function _analyzeSubAgentResults(sdId) {
  const { data: results, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      found: false,
      count: 0,
      results: [],
      error: error.message
    };
  }

  return {
    found: true,
    count: results?.length || 0,
    results: results || []
  };
}

/**
 * Categorize learning from SD context
 * Maps SD to one of 9 predefined learning categories (matching DB check constraint)
 *
 * Valid categories per retrospectives table check constraint:
 * - APPLICATION_ISSUE
 * - PROCESS_IMPROVEMENT
 * - TESTING_STRATEGY
 * - DATABASE_SCHEMA
 * - DEPLOYMENT_ISSUE
 * - PERFORMANCE_OPTIMIZATION
 * - USER_EXPERIENCE
 * - SECURITY_VULNERABILITY
 * - DOCUMENTATION
 */
function categorizeLearning(sdData, _prdData, _handoffs, _subAgentResults) {
  const title = sdData.title?.toLowerCase() || '';
  const scope = sdData.scope?.toLowerCase() || '';
  const category = sdData.category?.toLowerCase() || '';
  const description = sdData.description?.toLowerCase() || '';

  // Combine all text for keyword matching
  const allText = `${title} ${scope} ${category} ${description}`;

  // DATABASE_SCHEMA: Database-related learnings
  if (allText.match(/database|schema|migration|table|column|rls|postgres|supabase|sql/)) {
    return 'DATABASE_SCHEMA';
  }

  // TESTING_STRATEGY: Testing-related learnings
  if (allText.match(/test|e2e|unit|playwright|coverage|spec|vitest|qa|quality/)) {
    return 'TESTING_STRATEGY';
  }

  // DEPLOYMENT_ISSUE: Deployment/CI/CD learnings
  if (allText.match(/deploy|ci.?cd|github actions|pipeline|build|release/)) {
    return 'DEPLOYMENT_ISSUE';
  }

  // PERFORMANCE_OPTIMIZATION: Performance learnings
  if (allText.match(/performance|optimization|speed|cache|load time|latency/)) {
    return 'PERFORMANCE_OPTIMIZATION';
  }

  // SECURITY_VULNERABILITY: Security learnings
  if (allText.match(/security|auth|rls|permission|role|access control|vulnerability/)) {
    return 'SECURITY_VULNERABILITY';
  }

  // USER_EXPERIENCE: UI/UX learnings
  if (allText.match(/ux|ui|user experience|usability|interface|design|component|modal/)) {
    return 'USER_EXPERIENCE';
  }

  // DOCUMENTATION: Documentation learnings
  if (allText.match(/documentation|docs|readme|guide|instruction/)) {
    return 'DOCUMENTATION';
  }

  // PROCESS_IMPROVEMENT: Process/workflow learnings
  if (allText.match(/process|workflow|procedure|checklist|standard|handoff|protocol|bmad/)) {
    return 'PROCESS_IMPROVEMENT';
  }

  // APPLICATION_ISSUE: Default for any application-level issues
  return 'APPLICATION_ISSUE';
}

/**
 * Generate retrospective
 * LEO v4.3.4: Added testEvidence parameter for unified test evidence integration
 */
function generateRetrospective(sdData, prdData, handoffs, subAgentResults, _options, testEvidence = null) {
  // Calculate metrics
  const objectivesMet = sdData.status === 'completed';
  const onSchedule = true; // TODO: Compare actual vs estimated time
  const withinScope = true; // TODO: Compare deliverables vs plan

  // Analyze what went well
  const whatWentWell = [];
  if (objectivesMet) whatWentWell.push('All objectives met successfully');
  if (handoffs.count >= 3) whatWentWell.push(`${handoffs.count} handoffs completed per LEO Protocol`);
  if (prdData.found) whatWentWell.push('PRD created with clear requirements');
  if (subAgentResults.count > 0) whatWentWell.push(`${subAgentResults.count} sub-agents executed for validation`);

  // LEO v4.3.4: Include test evidence in what went well
  if (testEvidence) {
    if (testEvidence.verdict === 'PASS') {
      whatWentWell.push(`Comprehensive test coverage achieved (${testEvidence.pass_rate}% pass rate)`);
    } else if (testEvidence.pass_rate >= 80) {
      whatWentWell.push(`Good test coverage maintained (${testEvidence.pass_rate}% pass rate)`);
    }
  }

  // Analyze what needs improvement
  const whatNeedsImprovement = [];
  if (!prdData.found) whatNeedsImprovement.push('No PRD created - PLAN phase skipped');
  if (handoffs.count < 4) whatNeedsImprovement.push('Incomplete handoff chain - missing phase transitions');
  if (subAgentResults.count === 0) whatNeedsImprovement.push('No sub-agent validations - manual verification required');

  // LEO v4.3.4: Include test evidence issues in improvements
  if (testEvidence) {
    if (testEvidence.verdict === 'FAIL') {
      whatNeedsImprovement.push(`Test failures need resolution (${testEvidence.pass_rate}% pass rate)`);
    } else if (testEvidence.pass_rate < 80) {
      whatNeedsImprovement.push(`Improve test coverage (currently ${testEvidence.pass_rate}%)`);
    }
    if (testEvidence.freshness_status === 'STALE') {
      whatNeedsImprovement.push('Test evidence is stale - re-run tests before completion');
    }
  } else {
    whatNeedsImprovement.push('No unified test evidence found - consider running comprehensive E2E tests');
  }

  // Key learnings
  const keyLearnings = [
    'Database-first architecture maintained throughout SD lifecycle',
    'LEO Protocol phases followed systematically',
    'Sub-agent automation improved validation coverage'
  ];

  // Identify success patterns
  const successPatterns = [];
  if (whatWentWell.length > 3) successPatterns.push('Comprehensive validation');
  if (handoffs.count >= 4) successPatterns.push('Complete LEO Protocol workflow');
  if (subAgentResults.count >= 3) successPatterns.push('Multi-dimensional verification');

  // Identify failure patterns (if any)
  const failurePatterns = [];
  if (whatNeedsImprovement.length > 2) failurePatterns.push('Protocol shortcuts taken');

  // Generate LEO Protocol improvements based on gaps identified
  const protocolImprovements = generateProtocolImprovements(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement);

  // Action items
  const actionItems = [
    'Review retrospective learnings before next SD',
    'Apply patterns from this SD to similar future work',
    'Update sub-agent instructions with new insights'
  ];

  // Add protocol improvement actions if any were identified
  if (protocolImprovements.length > 0) {
    actionItems.push(`Apply ${protocolImprovements.length} LEO Protocol improvement(s) to leo_protocol_sections table`);
  }

  // Calculate quality score
  let qualityScore = 70; // Base score
  if (objectivesMet) qualityScore += 10;
  if (prdData.found) qualityScore += 5;
  if (handoffs.count >= 4) qualityScore += 10;
  if (subAgentResults.count >= 3) qualityScore += 5;

  // Team satisfaction (1-10 scale)
  let teamSatisfaction = 7; // Base
  if (objectivesMet) teamSatisfaction += 1;
  if (qualityScore >= 90) teamSatisfaction += 1;
  if (teamSatisfaction > 10) teamSatisfaction = 10;

  // Categorize learning (REQUIRED: learning_category is NOT NULL in retrospectives table)
  const learningCategory = categorizeLearning(sdData, prdData, handoffs, subAgentResults);

  return {
    sd_id: sdData.id,
    target_application: sdData.target_application, // CRITICAL: Required field for retrospectives table
    title: `${sdData.title} - Retrospective`,
    retro_type: 'SD_COMPLETION',
    conducted_date: new Date().toISOString().split('T')[0],
    generated_by: 'MANUAL', // Per check constraint
    status: 'PUBLISHED', // Per check constraint
    learning_category: learningCategory, // CRITICAL: Required field (NOT NULL constraint)
    what_went_well: whatWentWell,
    what_needs_improvement: whatNeedsImprovement,
    key_learnings: keyLearnings,
    success_patterns: successPatterns,
    failure_patterns: failurePatterns,
    action_items: actionItems,
    quality_score: qualityScore,
    team_satisfaction: teamSatisfaction,
    objectives_met: objectivesMet,
    on_schedule: onSchedule,
    within_scope: withinScope,
    velocity_achieved: sdData.progress_percentage || 100,
    business_value_delivered: qualityScore,
    auto_generated: true,
    description: `Comprehensive retrospective for ${sdData.title}. Generated by RETRO sub-agent.`,
    protocol_improvements: protocolImprovements
  };
}

/**
 * Generate LEO Protocol improvements based on retrospective analysis
 * These improvements feed back into the LEO Protocol for continuous improvement
 *
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} prdData - PRD data
 * @param {Object} handoffs - Handoff analysis
 * @param {Object} subAgentResults - Sub-agent execution results
 * @param {Array} whatNeedsImprovement - Identified improvement areas
 * @returns {Array} Protocol improvements in structured format
 */
function generateProtocolImprovements(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement) {
  const improvements = [];

  // Analyze gaps and generate protocol improvements

  // Gap 1: Missing PRD indicates PLAN phase was skipped
  if (!prdData.found) {
    improvements.push({
      category: 'PLAN_ENFORCEMENT',
      improvement: 'Enforce LEAD→PLAN handoff requirement: Block EXEC phase if no PRD exists',
      evidence: `SD ${sdData.id} proceeded without PRD creation`,
      impact: 'Prevents implementation without documented requirements',
      affected_phase: 'LEAD'
    });
  }

  // Gap 2: Incomplete handoff chain
  if (handoffs.count < 4) {
    const missingHandoffs = 4 - handoffs.count;
    improvements.push({
      category: 'HANDOFF_ENFORCEMENT',
      improvement: `Strengthen handoff validation: ${missingHandoffs} handoff(s) missing from complete chain`,
      evidence: `SD ${sdData.id} had ${handoffs.count}/4 expected handoffs`,
      impact: 'Ensures complete LEAD→PLAN→EXEC→PLAN→LEAD cycle',
      affected_phase: null // Affects all phases
    });
  }

  // Gap 3: No sub-agent validations
  if (subAgentResults.count === 0) {
    improvements.push({
      category: 'SUB_AGENT_AUTOMATION',
      improvement: 'Auto-trigger sub-agents on handoff creation: No sub-agents executed during SD lifecycle',
      evidence: `SD ${sdData.id} completed without any sub-agent validations`,
      impact: 'Prevents quality gaps from manual-only verification',
      affected_phase: 'EXEC'
    });
  }

  // Gap 4: Check for testing sub-agent specifically
  const testingRun = subAgentResults.results?.some(r => r.sub_agent_code === 'TESTING');
  if (!testingRun && subAgentResults.count > 0) {
    improvements.push({
      category: 'TESTING_ENFORCEMENT',
      improvement: 'Mandate TESTING sub-agent execution before EXEC→PLAN handoff',
      evidence: `SD ${sdData.id} ran ${subAgentResults.count} sub-agents but not TESTING`,
      impact: 'Ensures test coverage validation before completion claims',
      affected_phase: 'EXEC'
    });
  }

  // Gap 5: Multiple improvement areas suggest process complexity
  if (whatNeedsImprovement.length > 3) {
    improvements.push({
      category: 'PROCESS_SIMPLIFICATION',
      improvement: 'Review SD scope: High improvement count suggests over-scoping',
      evidence: `SD ${sdData.id} identified ${whatNeedsImprovement.length} improvement areas`,
      impact: 'Encourages smaller, more focused SDs with fewer gaps',
      affected_phase: 'LEAD'
    });
  }

  // Gap 6: Category-specific improvements
  const category = sdData.category?.toLowerCase() || '';

  if (category.includes('test') || category.includes('qa')) {
    // Testing-focused SD should have explicit test metrics
    improvements.push({
      category: 'TESTING_METRICS',
      improvement: 'Add test coverage metrics to testing-focused SD retrospectives',
      evidence: `SD ${sdData.id} is testing-related but may lack coverage metrics`,
      impact: 'Quantifies testing improvements for future reference',
      affected_phase: 'PLAN'
    });
  }

  if (category.includes('database') || category.includes('schema')) {
    // Database SDs should validate migrations
    improvements.push({
      category: 'DATABASE_VALIDATION',
      improvement: 'Mandate DATABASE sub-agent for schema-related SDs',
      evidence: `SD ${sdData.id} involves database changes`,
      impact: 'Ensures schema changes are validated before deployment',
      affected_phase: 'EXEC'
    });
  }

  return improvements;
}

/**
 * Store retrospective in database
 */
async function storeRetrospective(retrospective) {
  try {
    const { data, error } = await supabase
      .from('retrospectives')
      .insert(retrospective)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      id: data.id
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
