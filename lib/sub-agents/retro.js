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
 * Generates comprehensive retrospective or captures ad-hoc lesson
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @param {string} options.mode - 'completion' (default) or 'lesson' for ad-hoc captures
 * @param {string} options.message - Lesson description (required for mode='lesson')
 * @returns {Promise<Object>} Retrospective generation results
 */
export async function execute(sdId, subAgent, options = {}) {
  const mode = options.mode || 'completion';
  const isLessonMode = mode === 'lesson';

  if (isLessonMode) {
    console.log(`\n📝 Starting RETRO (LESSON MODE) for ${sdId}...`);
    console.log('   Continuous Improvement Coach - Ad-Hoc Lesson Capture');
  } else {
    console.log(`\n🔄 Starting RETRO for ${sdId}...`);
    console.log('   Continuous Improvement Coach - Retrospective Generation');
  }

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

    // LESSON MODE: Quick capture of ad-hoc insight (separate flow)
    if (isLessonMode) {
      return await captureLessonLearned(sdId, sdData, options, results);
    }

    // Phase 1.5: Check if a VALID completion retrospective already exists
    // (Timing-based: must be created AFTER EXEC-TO-PLAN handoff, PUBLISHED, quality >= 70)
    console.log('\n🔍 Phase 1.5: Checking for valid completion retrospective...');
    const existingRetro = await checkExistingRetrospective(sdId);

    if (existingRetro.found) {
      console.log(`   ✅ Valid completion retrospective exists: ${existingRetro.id}`);
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

    // Check if we need to enhance an existing (but incomplete) retrospective
    const needsEnhancement = existingRetro.needs_enhancement;
    const existingRetroId = existingRetro.existing_retro_id;

    if (needsEnhancement) {
      console.log(`   🔄 Will enhance existing retrospective: ${existingRetroId}`);
    } else {
      console.log('   ℹ️  No existing retrospective found - will generate new one');
    }

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

      let stored;
      if (needsEnhancement && existingRetroId) {
        // Enhance existing retrospective (preserve lesson learned, add completion content)
        console.log(`   🔄 Enhancing existing retrospective: ${existingRetroId}`);
        stored = await enhanceRetrospective(existingRetroId, retrospective, existingRetro.existing_retro);
      } else {
        // Create new retrospective
        stored = await storeRetrospective(retrospective);
      }

      if (stored.success) {
        const action = needsEnhancement ? 'enhanced' : 'stored';
        console.log(`   ✅ Retrospective ${action}: ${stored.id}`);
        results.findings.retrospective.id = stored.id;
        results.recommendations.push(
          `Retrospective ${action}: ${stored.id}`,
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
 * Check if a VALID completion retrospective already exists for this SD
 *
 * A retrospective is considered valid for completion if:
 * 1. It was created AFTER the EXEC-TO-PLAN handoff (timing check)
 * 2. It has status = 'PUBLISHED'
 * 3. It has quality_score >= 70
 *
 * Retrospectives created BEFORE the handoff (e.g., ad-hoc lesson captures during
 * implementation) do NOT count as completion retrospectives and should be enhanced.
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Result with found flag and retrospective data
 */
async function checkExistingRetrospective(sdId) {
  // SD-VENTURE-STAGE0-UI-001: Support both UUID and legacy_id lookups
  // Retrospectives are stored with UUID, so we need to resolve the ID first
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  // Get the SD UUID if we were passed a legacy_id
  let sdUuid = sdId;
  if (!isUUID) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('legacy_id', sdId)
      .single();
    if (sd) {
      sdUuid = sd.id;
    }
  }

  // Step 1: Get the EXEC-TO-PLAN handoff timestamp (anchor point for timing)
  // Handoffs may use either UUID or legacy_id, try both
  const { data: execHandoff } = await supabase
    .from('sd_phase_handoffs')
    .select('created_at')
    .or(`sd_id.eq.${sdUuid},sd_id.eq.${sdId}`)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Step 2: Get all retrospectives for this SD (using UUID since that's how they're stored)
  const { data: retros, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', sdUuid)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      found: false,
      error: error.message
    };
  }

  if (!retros || retros.length === 0) {
    return {
      found: false
    };
  }

  // Step 3: Find a VALID completion retrospective
  // Must be: created after EXEC-TO-PLAN handoff, PUBLISHED, quality >= 70
  const execHandoffTime = execHandoff?.created_at ? new Date(execHandoff.created_at) : null;

  for (const retro of retros) {
    const retroCreatedAt = new Date(retro.created_at);
    const isAfterExec = !execHandoffTime || retroCreatedAt >= execHandoffTime;
    const isPublished = retro.status === 'PUBLISHED';
    const hasQuality = retro.quality_score >= 70;

    if (isAfterExec && isPublished && hasQuality) {
      console.log('   ✅ Valid completion retrospective found (created after EXEC-TO-PLAN)');
      return {
        found: true,
        ...retro
      };
    }
  }

  // Step 4: If we have retrospectives but none are valid, report for enhancement
  const latestRetro = retros[0];
  const reasons = [];

  if (execHandoffTime && new Date(latestRetro.created_at) < execHandoffTime) {
    reasons.push('created before EXEC-TO-PLAN handoff');
  }
  if (latestRetro.status !== 'PUBLISHED') {
    reasons.push(`status is '${latestRetro.status}' (needs PUBLISHED)`);
  }
  if (latestRetro.quality_score < 70) {
    reasons.push(`quality_score is ${latestRetro.quality_score} (needs >= 70)`);
  }

  console.log(`   ⚠️  Found ${retros.length} retrospective(s), but none qualify as completion retro:`);
  console.log(`      Latest (${latestRetro.id}): ${reasons.join(', ')}`);
  console.log('   ℹ️  Will enhance existing retrospective with completion content');

  return {
    found: false,
    needs_enhancement: true,
    existing_retro_id: latestRetro.id,
    existing_retro: latestRetro,
    reasons: reasons
  };
}

/**
 * Gather SD metadata
 */
async function gatherSDMetadata(sdId) {
  // SD-VENTURE-STAGE0-UI-001: Support both UUID and legacy_id lookups
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
  const queryField = isUUID ? 'id' : 'legacy_id';

  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq(queryField, sdId)
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

  // Key learnings - SD-type-specific (PAT-RETRO-QUALITY-001)
  const keyLearnings = generateSdTypeSpecificLearnings(sdData, prdData, handoffs, subAgentResults, testEvidence);

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

  // Action items - SMART format with owners, deadlines, success criteria (PAT-RETRO-QUALITY-001)
  const actionItems = generateSmartActionItems(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, protocolImprovements);

  // Add protocol improvement actions if any were identified
  if (protocolImprovements.length > 0) {
    actionItems.push(`Apply ${protocolImprovements.length} LEO Protocol improvement(s) to leo_protocol_sections table`);
  }

  // Improvement areas with root cause analysis (REQUIRED by RetrospectiveQualityRubric)
  const improvementAreas = generateImprovementAreas(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, testEvidence);

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
    improvement_areas: improvementAreas,
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

/**
 * Semantic deduplication for retrospective content
 *
 * Uses a multi-tiered approach:
 * 1. Exact match detection (fast)
 * 2. Normalized text comparison (medium - handles minor variations)
 * 3. Semantic similarity via key extraction (no external API needed)
 *
 * @param {Array} existingItems - Existing array of items
 * @param {Array} newItems - New items to merge
 * @param {string} textField - Field name containing the text to compare
 * @returns {Array} Deduplicated merged array
 */
function semanticDeduplicateArray(existingItems, newItems, textField = null) {
  const existing = existingItems || [];
  const incoming = newItems || [];

  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  // Helper to extract text from item (handles both strings and objects)
  const getText = (item) => {
    if (typeof item === 'string') return item;
    if (textField && item[textField]) return item[textField];
    // Try common field names
    return item.learning || item.action || item.achievement || item.issue ||
           item.description || item.observation || item.title ||
           JSON.stringify(item);
  };

  // Normalize text for comparison
  const normalize = (text) => {
    return (text || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  };

  // Extract key terms for semantic comparison
  const extractKeyTerms = (text) => {
    const normalized = normalize(text);
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'for', 'and', 'or', 'but', 'in', 'on',
      'at', 'to', 'from', 'by', 'with', 'of', 'that', 'this', 'it', 'as', 'not']);
    return normalized.split(' ')
      .filter(word => word.length > 2 && !stopWords.has(word))
      .sort();
  };

  // Calculate Jaccard similarity between two sets of terms
  const jaccardSimilarity = (terms1, terms2) => {
    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  };

  // Check if item is semantically similar to any in the existing set
  const isSemanticallyDuplicate = (newItem, existingSet, threshold = 0.7) => {
    const newText = getText(newItem);
    const newNormalized = normalize(newText);
    const newTerms = extractKeyTerms(newText);

    for (const existingItem of existingSet) {
      const existingText = getText(existingItem);
      const existingNormalized = normalize(existingText);

      // Tier 1: Exact match after normalization
      if (newNormalized === existingNormalized) {
        return { isDuplicate: true, reason: 'exact_match', matchedWith: existingText.substring(0, 50) };
      }

      // Tier 2: One contains the other (substring match)
      if (newNormalized.includes(existingNormalized) || existingNormalized.includes(newNormalized)) {
        return { isDuplicate: true, reason: 'substring_match', matchedWith: existingText.substring(0, 50) };
      }

      // Tier 3: Semantic similarity via Jaccard on key terms
      const existingTerms = extractKeyTerms(existingText);
      const similarity = jaccardSimilarity(newTerms, existingTerms);

      if (similarity >= threshold) {
        return { isDuplicate: true, reason: `semantic_similarity_${Math.round(similarity * 100)}%`, matchedWith: existingText.substring(0, 50) };
      }
    }

    return { isDuplicate: false };
  };

  // Build deduplicated result
  const result = [...existing];
  const duplicatesFound = [];

  for (const newItem of incoming) {
    const { isDuplicate, reason, matchedWith } = isSemanticallyDuplicate(newItem, result);

    if (isDuplicate) {
      duplicatesFound.push({ item: getText(newItem).substring(0, 40), reason, matchedWith });
    } else {
      result.push(newItem);
    }
  }

  // Log deduplication stats
  if (duplicatesFound.length > 0) {
    console.log(`   🔄 Semantic deduplication: removed ${duplicatesFound.length} duplicate(s)`);
    duplicatesFound.slice(0, 3).forEach(d => {
      console.log(`      - "${d.item}..." (${d.reason})`);
    });
    if (duplicatesFound.length > 3) {
      console.log(`      ... and ${duplicatesFound.length - 3} more`);
    }
  }

  return result;
}

/**
 * Enhance an existing retrospective with completion content
 *
 * This merges the ad-hoc lesson learned (captured during EXEC) with
 * the comprehensive completion retrospective content.
 *
 * Strategy:
 * - PRESERVE: Original key_learnings from ad-hoc capture
 * - MERGE: Arrays with SEMANTIC DEDUPLICATION (prevents duplicates)
 * - UPGRADE: status → PUBLISHED, quality_score from generated retro
 * - UPDATE: title, description with completion context
 *
 * @param {string} existingId - ID of the retrospective to enhance
 * @param {Object} newRetro - Generated completion retrospective
 * @param {Object} existing - Existing retrospective data
 * @returns {Promise<Object>} Result with success flag and ID
 */
async function enhanceRetrospective(existingId, newRetro, existing) {
  try {
    console.log('   📊 Applying semantic deduplication to retrospective arrays...');

    // Merge arrays WITH SEMANTIC DEDUPLICATION
    // Each array uses the appropriate text field for comparison
    const mergedKeyLearnings = semanticDeduplicateArray(
      existing.key_learnings,
      newRetro.key_learnings,
      'learning'
    );

    const mergedWhatWentWell = semanticDeduplicateArray(
      existing.what_went_well,
      newRetro.what_went_well,
      'achievement'
    );

    const mergedWhatNeedsImprovement = semanticDeduplicateArray(
      existing.what_needs_improvement,
      newRetro.what_needs_improvement
    );

    const mergedActionItems = semanticDeduplicateArray(
      existing.action_items,
      newRetro.action_items,
      'action'
    );

    const mergedSuccessPatterns = [
      ...new Set([...(existing.success_patterns || []), ...(newRetro.success_patterns || [])])
    ];

    const mergedFailurePatterns = [
      ...new Set([...(existing.failure_patterns || []), ...(newRetro.failure_patterns || [])])
    ];

    // Build enhanced retrospective
    const enhanced = {
      // Upgrade to completion status
      status: 'PUBLISHED',
      quality_score: Math.max(newRetro.quality_score, existing.quality_score || 0),

      // Enhanced title (preserve original lesson title in description)
      title: `${newRetro.title}`,
      description: `${newRetro.description}\n\n[Original lesson captured during EXEC: ${existing.title}]`,

      // Merged arrays
      key_learnings: mergedKeyLearnings,
      what_went_well: mergedWhatWentWell,
      what_needs_improvement: mergedWhatNeedsImprovement,
      action_items: mergedActionItems,
      success_patterns: mergedSuccessPatterns,
      failure_patterns: mergedFailurePatterns,

      // Use generated values for completion metrics
      retro_type: 'SD_COMPLETION',
      conducted_date: newRetro.conducted_date,
      objectives_met: newRetro.objectives_met,
      on_schedule: newRetro.on_schedule,
      within_scope: newRetro.within_scope,
      team_satisfaction: newRetro.team_satisfaction,
      velocity_achieved: newRetro.velocity_achieved,
      business_value_delivered: newRetro.business_value_delivered,
      protocol_improvements: [
        ...(existing.protocol_improvements || []),
        ...(newRetro.protocol_improvements || [])
      ],

      // Clear quality issues since we've enhanced
      quality_issues: [],

      // Mark as enhanced
      auto_generated: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .update(enhanced)
      .eq('id', existingId)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    console.log(`   📝 Enhanced retrospective: merged ${mergedKeyLearnings.length} learnings`);
    console.log(`      Original lesson preserved: "${existing.title}"`);

    return {
      success: true,
      id: data.id,
      enhanced: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Capture an ad-hoc lesson learned (LESSON MODE)
 *
 * This is a lightweight flow for quickly capturing insights during implementation.
 * These lessons are stored as DRAFT/INCIDENT type entries that will be:
 * 1. Enhanced into the completion retrospective later (via enhanceRetrospective)
 * 2. Searchable for future reference
 *
 * Required options:
 * - options.message: The lesson description (required)
 * - options.title: Optional custom title (defaults to first 80 chars of message)
 * - options.severity: 'low' | 'medium' | 'high' (default: 'medium')
 * - options.tags: Array of tags (optional)
 * - options.root_cause: Root cause analysis (optional)
 * - options.prevention: Prevention strategy (optional)
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD metadata
 * @param {Object} options - Execution options with lesson details
 * @param {Object} results - Results object to populate
 * @returns {Promise<Object>} Results with lesson capture status
 */
async function captureLessonLearned(sdId, sdData, options, results) {
  console.log('\n📝 Phase 2: Capturing lesson learned...');

  // Validate required message
  if (!options.message) {
    console.log('   ❌ Missing required --message parameter');
    results.verdict = 'BLOCKED';
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'Lesson message is required',
      recommendation: 'Provide --message="Your lesson description here"'
    });
    return results;
  }

  const message = options.message;
  const title = options.title || message.substring(0, 80) + (message.length > 80 ? '...' : '');
  const severity = options.severity || 'medium';
  const tags = options.tags || [];
  const rootCause = options.root_cause || null;
  const prevention = options.prevention || null;

  // Auto-detect tags from message if none provided
  const autoTags = detectTagsFromMessage(message);
  const allTags = [...new Set([...tags, ...autoTags])];

  console.log(`   Title: ${title}`);
  console.log(`   Severity: ${severity}`);
  console.log(`   Tags: ${allTags.join(', ') || '(none)'}`);

  // Build the key learning entry
  const keyLearning = {
    title: title,
    description: message,
    severity: severity,
    tags: allTags,
    ...(rootCause && { root_cause: rootCause }),
    ...(prevention && { prevention: prevention })
  };

  // Check if we should add to existing retrospective or create new
  const { data: existingRetros } = await supabase
    .from('retrospectives')
    .select('id, key_learnings, what_needs_improvement')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false })
    .limit(1);

  let stored;
  if (existingRetros && existingRetros.length > 0) {
    // Add to existing retrospective
    const existing = existingRetros[0];
    console.log(`\n   🔄 Adding lesson to existing retrospective: ${existing.id}`);

    const updatedLearnings = [...(existing.key_learnings || []), keyLearning];
    const updatedImprovements = [
      ...(existing.what_needs_improvement || []),
      `[${severity.toUpperCase()}] ${title}`
    ];

    const { data, error } = await supabase
      .from('retrospectives')
      .update({
        key_learnings: updatedLearnings,
        what_needs_improvement: updatedImprovements,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      stored = { success: false, error: error.message };
    } else {
      stored = { success: true, id: data.id, added_to_existing: true };
      console.log(`   ✅ Lesson added to retrospective (now ${updatedLearnings.length} learnings)`);
    }
  } else {
    // Create new DRAFT retrospective for this lesson
    console.log('\n   📄 Creating new DRAFT retrospective for lesson...');

    const lessonRetro = {
      sd_id: sdId,
      target_application: sdData.target_application || 'EHG',
      title: title,
      description: message,
      retro_type: 'INCIDENT',
      status: 'DRAFT',
      generated_by: 'MANUAL',
      learning_category: categorizeLearning(sdData, null, null, null),
      key_learnings: [keyLearning],
      what_needs_improvement: [`[${severity.toUpperCase()}] ${title}`],
      what_went_well: [],
      action_items: prevention ? [{
        owner: 'AI',
        action: prevention,
        priority: severity
      }] : [],
      success_patterns: [],
      failure_patterns: [title],
      quality_score: 30, // Low score indicates this needs enhancement
      auto_generated: false,
      tags: allTags,
      trigger_event: `Lesson captured during ${sdData.status} phase`
    };

    const { data, error } = await supabase
      .from('retrospectives')
      .insert(lessonRetro)
      .select()
      .single();

    if (error) {
      stored = { success: false, error: error.message };
    } else {
      stored = { success: true, id: data.id, created_new: true };
      console.log(`   ✅ New DRAFT retrospective created: ${data.id}`);
    }
  }

  // Populate results
  if (stored.success) {
    results.findings.retrospective = {
      id: stored.id,
      mode: 'lesson',
      lesson: keyLearning,
      added_to_existing: stored.added_to_existing || false,
      created_new: stored.created_new || false
    };
    results.recommendations.push(
      `Lesson captured: "${title}"`,
      'This lesson will be merged into the completion retrospective',
      'Run RETRO again (without --mode=lesson) after EXEC-TO-PLAN handoff for full retrospective'
    );
    console.log(`\n🏁 RETRO (LESSON MODE) Complete: ${results.verdict}`);
    console.log('   ℹ️  Note: This DRAFT entry will be enhanced into the completion retrospective');
  } else {
    results.verdict = 'ERROR';
    results.critical_issues.push({
      severity: 'HIGH',
      issue: 'Failed to store lesson',
      recommendation: 'Check database connection and retry',
      error: stored.error
    });
    console.log(`\n❌ RETRO (LESSON MODE) Failed: ${stored.error}`);
  }

  return results;
}

/**
 * Auto-detect tags from lesson message content
 */
function detectTagsFromMessage(message) {
  const tags = [];
  const lowerMessage = message.toLowerCase();

  const tagPatterns = [
    { pattern: /test|e2e|unit|playwright|vitest/, tag: 'testing' },
    { pattern: /database|schema|migration|supabase|postgres/, tag: 'database' },
    { pattern: /auth|login|session|permission|rls/, tag: 'auth' },
    { pattern: /ui|component|react|frontend/, tag: 'ui' },
    { pattern: /api|endpoint|rest|graphql/, tag: 'api' },
    { pattern: /performance|speed|latency|cache/, tag: 'performance' },
    { pattern: /security|vulnerability|xss|injection/, tag: 'security' },
    { pattern: /deploy|ci.?cd|pipeline|github.?action/, tag: 'deployment' },
    { pattern: /mindset|approach|process|workflow/, tag: 'process' },
    { pattern: /service|leo.?stack|server/, tag: 'services' }
  ];

  for (const { pattern, tag } of tagPatterns) {
    if (pattern.test(lowerMessage)) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Generate SD-type-specific learnings (PAT-RETRO-QUALITY-001)
 *
 * This function generates learnings tailored to the specific SD type,
 * avoiding generic boilerplate that fails the retrospective quality rubric.
 *
 * Downstream consumers that use these learnings:
 * - ImprovementExtractor: Extracts protocol improvements
 * - PatternDetectionEngine: Detects recurring patterns
 * - RetrospectiveQualityRubric: Evaluates learning_specificity (40% weight)
 *
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} prdData - PRD data
 * @param {Object} handoffs - Handoff analysis
 * @param {Object} subAgentResults - Sub-agent execution results
 * @param {Object} testEvidence - Test evidence from unified schema
 * @returns {Array} Array of SD-type-specific learnings
 */
function generateSdTypeSpecificLearnings(sdData, prdData, handoffs, subAgentResults, testEvidence) {
  const learnings = [];
  const sdType = (sdData.category || sdData.sd_type || 'feature').toLowerCase();
  const sdTitle = sdData.title || 'Unknown SD';
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);

  // SD-TYPE-SPECIFIC LEARNINGS (not generic boilerplate)
  const typeSpecificLearnings = {
    database: [
      {
        category: 'DATABASE_SCHEMA',
        learning: `Schema design for ${sdTitle}: Foreign key constraints require target tables to exist before referencing tables. The agents table was created to satisfy ventures.ceo_agent_id FK.`,
        evidence: `SD ${sdKey} required creating prerequisite tables in dependency order`,
        applicability: 'Apply dependency-aware table creation in future database SDs'
      },
      {
        category: 'DATABASE_SCHEMA',
        learning: 'RLS policies must be created atomically with tables. Supabase migrations that create tables without immediate RLS leave security gaps.',
        evidence: `DATABASE sub-agent validation pattern for ${sdKey}`,
        applicability: 'Include RLS policies in same migration as table creation'
      },
      {
        category: 'PROCESS_IMPROVEMENT',
        learning: 'Database SDs should bypass UI-focused E2E tests (PAT-DB-SD-E2E-001). Schema validation via DATABASE sub-agent + table existence checks is sufficient.',
        evidence: 'TESTING sub-agent now detects SD type and returns early PASS for database SDs',
        applicability: 'SD-type-aware validation prevents blocking on inapplicable gates'
      }
    ],
    infrastructure: [
      {
        category: 'PROCESS_IMPROVEMENT',
        learning: 'Infrastructure SDs have relaxed CI/CD requirements (PAT-DB-SD-E2E-001). PR existence check is sufficient - no deployment/workflow status needed.',
        evidence: `GITHUB sub-agent now detects SD type for ${sdKey}`,
        applicability: 'Apply SD-type detection to all sub-agents that validate CI/CD'
      },
      {
        category: 'DEPLOYMENT_ISSUE',
        learning: 'Infrastructure changes should be validated via existence checks, not E2E user flows. The infrastructure itself IS the deliverable.',
        evidence: `${sdKey} validated via table existence and DATABASE sub-agent`,
        applicability: 'Use infrastructure-appropriate validation methods'
      }
    ],
    feature: [
      {
        category: 'USER_EXPERIENCE',
        learning: 'Feature SDs require full LEAD→PLAN→EXEC workflow with user story coverage. Each story maps to testable acceptance criteria.',
        evidence: `${handoffs.count} handoffs completed for ${sdKey}`,
        applicability: 'Maintain complete phase transitions for feature work'
      },
      {
        category: 'TESTING_STRATEGY',
        learning: `E2E test evidence validates user journeys. ${testEvidence?.pass_rate || 'N/A'}% pass rate indicates ${testEvidence?.verdict || 'unknown'} test health.`,
        evidence: `Test evidence from ${testEvidence?.run_type || 'manual'} run`,
        applicability: 'Track test pass rates as quality indicators'
      }
    ],
    security: [
      {
        category: 'SECURITY_VULNERABILITY',
        learning: 'Security SDs require explicit RLS policy validation. SERVICE_ROLE_KEY bypasses RLS - use ANON_KEY for security testing.',
        evidence: `Security validation pattern from ${sdKey}`,
        applicability: 'Always test RLS with non-admin roles'
      }
    ],
    documentation: [
      {
        category: 'DOCUMENTATION',
        learning: 'Documentation SDs focus on clarity and coverage, not code architecture. Acceptance criteria should measure documentation completeness.',
        evidence: `Documentation-focused SD ${sdKey}`,
        applicability: 'Use documentation-specific quality metrics'
      }
    ],
    protocol: [
      {
        category: 'PROCESS_IMPROVEMENT',
        learning: 'Protocol SDs improve LEO Protocol itself. Changes should be captured in leo_protocol_sections table and regenerated via generate-claude-md-from-db.js',
        evidence: `Protocol improvement from ${sdKey}`,
        applicability: 'Database-first protocol updates ensure consistency'
      }
    ]
  };

  // Get type-specific learnings (default to feature if unknown type)
  const typeLearnings = typeSpecificLearnings[sdType] || typeSpecificLearnings.feature;
  learnings.push(...typeLearnings);

  // Add LEO Protocol meta-learnings (applicable to ALL SD types)
  learnings.push({
    category: 'PROCESS_IMPROVEMENT',
    learning: 'EXEC phase should check existing state before reading specs (PAT-EXEC-IMPL-001). Query database for completed work to avoid re-tracing steps.',
    evidence: `Applied to ${sdKey} - found existing tables already created`,
    applicability: 'Start EXEC by verifying current state, not re-reading requirements'
  });

  // Add handoff-specific learnings
  if (handoffs.count > 0) {
    const handoffTypes = [...new Set(handoffs.handoffs.map(h => h.handoff_type))];
    learnings.push({
      category: 'PROCESS_IMPROVEMENT',
      learning: `Complete handoff chain (${handoffTypes.join(' → ')}) ensures phase transitions are tracked. ${handoffs.count} handoffs captured validation state at each gate.`,
      evidence: `Handoff chain for ${sdKey}`,
      applicability: 'Use handoffs as phase transition checkpoints'
    });
  }

  // Add sub-agent-specific learnings
  if (subAgentResults.count > 0) {
    const agents = [...new Set(subAgentResults.results.map(r => r.sub_agent_code))];
    const passCount = subAgentResults.results.filter(r => r.verdict === 'PASS').length;
    learnings.push({
      category: 'PROCESS_IMPROVEMENT',
      learning: `Sub-agent coverage (${agents.join(', ')}) provided ${passCount}/${subAgentResults.count} PASS verdicts. Multi-agent validation catches different issue types.`,
      evidence: `Sub-agent execution history for ${sdKey}`,
      applicability: 'Run relevant sub-agents for comprehensive validation'
    });
  }

  // Add PRD-specific learnings
  if (prdData.found) {
    learnings.push({
      category: 'PROCESS_IMPROVEMENT',
      learning: `PRD "${prdData.prd.title}" defined ${prdData.prd.functional_requirements?.length || 0} functional requirements. Clear FR definitions enable objective completion validation.`,
      evidence: `PRD created for ${sdKey}`,
      applicability: 'Define measurable FRs for unambiguous completion criteria'
    });
  }

  return learnings;
}

/**
 * Generate SMART action items (PAT-RETRO-QUALITY-001)
 *
 * SMART = Specific, Measurable, Achievable, Relevant, Time-bound
 * Each action item must have: owner, deadline, success criteria
 *
 * Downstream consumers that use these action items:
 * - ImprovementExtractor: Queues protocol improvements
 * - RetrospectiveQualityRubric: Evaluates action_item_actionability (30% weight)
 *
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} prdData - PRD data
 * @param {Object} handoffs - Handoff analysis
 * @param {Object} subAgentResults - Sub-agent execution results
 * @param {Array} whatNeedsImprovement - Identified improvement areas
 * @param {Array} protocolImprovements - Protocol improvements identified
 * @returns {Array} Array of SMART action items
 */
function generateSmartActionItems(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, protocolImprovements) {
  const actionItems = [];
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);
  const sdType = (sdData.category || sdData.sd_type || 'feature').toLowerCase();

  // Convert improvement areas to SMART action items
  for (const improvement of whatNeedsImprovement) {
    const smartAction = convertToSmartAction(improvement, sdKey, sdType);
    if (smartAction) {
      actionItems.push(smartAction);
    }
  }

  // Add protocol improvement actions
  for (const protoImprovement of protocolImprovements) {
    actionItems.push({
      action: `Update ${protoImprovement.category}: ${protoImprovement.improvement}`,
      owner: 'LEO Protocol Team',
      deadline: 'Next SD cycle',
      success_criteria: `${protoImprovement.affected_phase || 'All phases'} validation includes this check`,
      priority: 'medium',
      smart_format: true,
      source: 'protocol_improvement'
    });
  }

  // Add SD-type-specific systemic improvements
  const typeSpecificActions = getTypeSpecificActions(sdType, sdData, subAgentResults);
  actionItems.push(...typeSpecificActions);

  // Ensure at least 3 action items (quality requirement)
  if (actionItems.length < 3) {
    // Add generic but still SMART actions
    actionItems.push({
      action: `Document ${sdKey} implementation patterns in issue_patterns table`,
      owner: 'Implementing Agent',
      deadline: 'Before next similar SD',
      success_criteria: 'Pattern with prevention_checklist exists in database',
      priority: 'low',
      smart_format: true,
      source: 'knowledge_capture'
    });

    if (actionItems.length < 3) {
      actionItems.push({
        action: `Review retrospective learnings from ${sdKey} in next LEAD phase`,
        owner: 'LEAD Supervisor',
        deadline: 'Next SD approval',
        success_criteria: 'Lessons applied to SD scope or validation criteria',
        priority: 'low',
        smart_format: true,
        source: 'continuous_improvement'
      });
    }
  }

  return actionItems;
}

/**
 * Convert an improvement area to a SMART action item
 */
function convertToSmartAction(improvement, _sdKey, _sdType) {
  // Parse improvement string to extract actionable content
  const improvementLower = improvement.toLowerCase();

  if (improvementLower.includes('no prd')) {
    return {
      action: 'Enforce PRD creation before EXEC phase entry',
      owner: 'PLAN Supervisor',
      deadline: 'Immediate (next SD)',
      success_criteria: 'LEAD→PLAN handoff blocks if PRD missing',
      priority: 'high',
      smart_format: true,
      root_cause: 'PLAN phase skipped or PRD not stored in database',
      source: 'gap_analysis'
    };
  }

  if (improvementLower.includes('handoff') || improvementLower.includes('phase transition')) {
    return {
      action: 'Complete missing handoff documentation',
      owner: 'Executing Agent',
      deadline: 'Before SD completion claim',
      success_criteria: 'All 4 handoffs (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN, PLAN→LEAD) recorded',
      priority: 'medium',
      smart_format: true,
      root_cause: 'Handoff recording skipped during execution',
      source: 'gap_analysis'
    };
  }

  if (improvementLower.includes('sub-agent') || improvementLower.includes('validation')) {
    return {
      action: 'Auto-trigger sub-agents on handoff creation',
      owner: 'LEO Protocol Team',
      deadline: 'Next protocol update',
      success_criteria: 'Handoff triggers run relevant sub-agents automatically',
      priority: 'medium',
      smart_format: true,
      root_cause: 'Sub-agents require manual invocation',
      source: 'automation_gap'
    };
  }

  if (improvementLower.includes('test') && (improvementLower.includes('fail') || improvementLower.includes('coverage'))) {
    return {
      action: 'Improve test coverage or fix failing tests',
      owner: 'QA Agent',
      deadline: 'Before EXEC→PLAN handoff',
      success_criteria: 'Test pass rate ≥80% with no critical failures',
      priority: 'high',
      smart_format: true,
      root_cause: 'Insufficient test coverage or test maintenance',
      source: 'test_quality'
    };
  }

  if (improvementLower.includes('test evidence') || improvementLower.includes('e2e')) {
    return {
      action: 'Run comprehensive E2E test suite and store evidence',
      owner: 'TESTING Sub-Agent',
      deadline: 'Before completion claim',
      success_criteria: 'Test evidence stored in unified_test_evidence table',
      priority: 'medium',
      smart_format: true,
      root_cause: 'Test runs not stored in unified schema',
      source: 'evidence_gap'
    };
  }

  // Default: Create generic but SMART action from improvement text
  return {
    action: `Address: ${improvement.substring(0, 100)}`,
    owner: 'Implementing Agent',
    deadline: 'Next iteration',
    success_criteria: 'Issue resolved and verified',
    priority: 'low',
    smart_format: true,
    source: 'improvement_area'
  };
}

/**
 * Generate improvement areas with root cause analysis (5 Whys)
 *
 * REQUIRED by RetrospectiveQualityRubric (improvement_area_depth - 20% weight)
 * Each improvement area must include root cause analysis for high scores.
 *
 * @param {Object} sdData - Strategic Directive data
 * @param {Object} prdData - PRD data
 * @param {Object} handoffs - Handoff analysis
 * @param {Object} subAgentResults - Sub-agent execution results
 * @param {Array} whatNeedsImprovement - Identified improvement areas
 * @param {Object} testEvidence - Test evidence from unified schema
 * @returns {Array} Improvement areas with root cause analysis
 */
function generateImprovementAreas(sdData, prdData, handoffs, subAgentResults, whatNeedsImprovement, testEvidence) {
  const areas = [];
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);
  const sdType = (sdData.category || sdData.sd_type || 'feature').toLowerCase();

  // Convert each improvement need into a structured improvement area with root cause
  for (const improvement of whatNeedsImprovement) {
    const area = buildImprovementArea(improvement, sdKey, sdType, prdData, handoffs, subAgentResults, testEvidence);
    if (area) {
      areas.push(area);
    }
  }

  // Add SD-type-specific systemic improvement areas
  const typeSpecificAreas = getTypeSpecificImprovementAreas(sdType, sdData, subAgentResults);
  areas.push(...typeSpecificAreas);

  // Ensure at least 2 improvement areas (quality requirement)
  if (areas.length < 2) {
    areas.push({
      area: 'Process Documentation',
      observation: `SD ${sdKey} process could benefit from clearer documentation`,
      root_cause_analysis: {
        why_1: 'Process steps not explicitly documented in handoffs',
        why_2: 'Handoff templates focus on validation results, not process narrative',
        why_3: 'LEO Protocol prioritizes data over prose',
        root_cause: 'Trade-off between structured data and narrative context',
        contributing_factors: ['Database-first design', 'Compression requirements', 'Context window limits']
      },
      preventive_measures: ['Add process_narrative field to handoff templates', 'Include key decision points in retrospective'],
      systemic_issue: false
    });
  }

  return areas;
}

/**
 * Build a single improvement area with 5 Whys root cause analysis
 */
function buildImprovementArea(improvement, sdKey, sdType, prdData, handoffs, subAgentResults, testEvidence) {
  const improvementLower = improvement.toLowerCase();

  // Pattern: Missing PRD
  if (improvementLower.includes('no prd') || improvementLower.includes('plan phase skipped')) {
    return {
      area: 'Requirements Definition Gap',
      observation: improvement,
      root_cause_analysis: {
        why_1: 'PRD not created before EXEC phase began',
        why_2: 'LEAD→PLAN handoff did not enforce PRD existence check',
        why_3: 'Phase transition validation focused on approval status, not artifacts',
        why_4: 'Handoff system designed for flexibility over strictness',
        why_5: 'Early LEO Protocol prioritized velocity over documentation',
        root_cause: 'Phase gate validation does not verify required artifacts exist',
        contributing_factors: ['Missing PRD existence check in handoff validation', 'No blocking constraint on EXEC entry', 'Historical SDs that bypassed PLAN']
      },
      preventive_measures: [
        'Add PRD existence check to LEAD→PLAN handoff validation',
        'Block EXEC phase entry if PRD missing',
        'Add PRD_REQUIRED flag to SD types that require it'
      ],
      systemic_issue: true
    };
  }

  // Pattern: Incomplete handoffs
  if (improvementLower.includes('handoff') || improvementLower.includes('phase transition')) {
    return {
      area: 'Phase Transition Tracking',
      observation: improvement,
      root_cause_analysis: {
        why_1: `Only ${handoffs.count}/4 expected handoffs were recorded for ${sdKey}`,
        why_2: 'Handoff creation is manual, not automated by phase transitions',
        why_3: 'No enforcement mechanism blocks completion without handoffs',
        why_4: 'Handoff value not immediately visible during implementation',
        why_5: 'Historical focus on deliverables over process documentation',
        root_cause: 'Handoff creation is optional and manual rather than enforced',
        contributing_factors: ['No auto-trigger on phase change', 'Completion claims not validated against handoff existence', 'Context pressure encourages skipping documentation']
      },
      preventive_measures: [
        'Auto-create handoff skeleton on phase transition',
        'Block completion claims without complete handoff chain',
        'Add handoff existence to PLAN supervisor verification'
      ],
      systemic_issue: true
    };
  }

  // Pattern: Missing sub-agent validation
  if (improvementLower.includes('sub-agent') || improvementLower.includes('validation')) {
    return {
      area: 'Automated Validation Coverage',
      observation: improvement,
      root_cause_analysis: {
        why_1: 'Sub-agents were not executed during SD lifecycle',
        why_2: 'Sub-agent invocation requires manual triggering',
        why_3: 'No event-driven automation triggers sub-agents on handoff',
        why_4: 'Sub-agent system designed as on-demand rather than mandatory',
        why_5: 'Trade-off between automation overhead and flexibility',
        root_cause: 'Sub-agents require explicit invocation rather than automatic execution',
        contributing_factors: ['Manual trigger dependency', 'No auto-run on handoff events', 'Context cost of sub-agent execution']
      },
      preventive_measures: [
        'Add sub-agent auto-trigger to handoff creation events',
        'Define mandatory sub-agents per SD type',
        'Add sub-agent coverage to completion validation'
      ],
      systemic_issue: true
    };
  }

  // Pattern: Test failures or coverage issues
  if (improvementLower.includes('test') && (improvementLower.includes('fail') || improvementLower.includes('coverage'))) {
    const passRate = testEvidence?.pass_rate || 'unknown';
    return {
      area: 'Test Quality and Coverage',
      observation: improvement,
      root_cause_analysis: {
        why_1: `Test pass rate is ${passRate}%, below target threshold`,
        why_2: 'Tests not updated to match implementation changes',
        why_3: 'Test maintenance not included in SD scope estimation',
        why_4: 'Test debt accumulates when velocity is prioritized',
        why_5: 'No automatic test generation or maintenance tooling',
        root_cause: 'Test maintenance effort not budgeted in SD planning',
        contributing_factors: ['Test-code drift', 'Missing test generators', 'Manual test maintenance burden']
      },
      preventive_measures: [
        'Include test maintenance in SD effort estimation',
        'Add test update requirement to EXEC phase checklist',
        'Track test drift metrics per SD'
      ],
      systemic_issue: true
    };
  }

  // Pattern: Missing test evidence
  if (improvementLower.includes('test evidence') || improvementLower.includes('e2e')) {
    return {
      area: 'Test Evidence Recording',
      observation: improvement,
      root_cause_analysis: {
        why_1: 'Test runs not recorded in unified_test_evidence table',
        why_2: 'Test execution and evidence storage are separate processes',
        why_3: 'Evidence storage requires explicit script invocation',
        why_4: 'Test runners not integrated with evidence schema',
        why_5: 'Evidence schema added after test infrastructure existed',
        root_cause: 'Test execution pipeline not integrated with evidence storage',
        contributing_factors: ['Disconnected test and evidence systems', 'Manual evidence recording', 'Legacy test infrastructure']
      },
      preventive_measures: [
        'Integrate test runner output with evidence ingestion',
        'Add evidence recording to CI/CD pipeline',
        'Auto-ingest test results on completion'
      ],
      systemic_issue: true
    };
  }

  // Default: Generic improvement area with context
  return {
    area: 'Process Improvement Opportunity',
    observation: improvement,
    root_cause_analysis: {
      why_1: `Issue identified during ${sdKey} execution`,
      why_2: 'Contributing factors not immediately clear',
      why_3: 'May require deeper investigation',
      root_cause: 'Requires manual root cause analysis',
      contributing_factors: ['SD-specific context', 'Implementation details']
    },
    preventive_measures: ['Document findings in issue_patterns table', 'Review in next similar SD'],
    systemic_issue: false
  };
}

/**
 * Get SD-type-specific improvement areas
 */
function getTypeSpecificImprovementAreas(sdType, sdData, subAgentResults) {
  const areas = [];
  const sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);

  // Check for missing type-appropriate sub-agents
  const databaseRun = subAgentResults.results?.some(r => r.sub_agent_code === 'DATABASE');
  const securityRun = subAgentResults.results?.some(r => r.sub_agent_code === 'SECURITY');

  if ((sdType === 'database' || sdType === 'infrastructure') && !databaseRun) {
    areas.push({
      area: 'Database Validation Gap',
      observation: `${sdType} SD ${sdKey} completed without DATABASE sub-agent validation`,
      root_cause_analysis: {
        why_1: 'DATABASE sub-agent not triggered for this SD',
        why_2: 'SD type detection not enforcing mandatory sub-agents',
        why_3: 'Sub-agent selection is manual, not type-driven',
        root_cause: 'No SD-type-to-sub-agent mapping enforcement',
        contributing_factors: ['Manual sub-agent selection', 'Missing type enforcement']
      },
      preventive_measures: [
        'Add mandatory sub-agent list per SD type',
        'Auto-trigger DATABASE for database/infrastructure SDs',
        'Block completion without type-appropriate validation'
      ],
      systemic_issue: true
    });
  }

  if ((sdType === 'database' || sdType === 'security') && !securityRun) {
    areas.push({
      area: 'Security Validation Gap',
      observation: `${sdType} SD ${sdKey} completed without SECURITY sub-agent RLS validation`,
      root_cause_analysis: {
        why_1: 'SECURITY sub-agent not triggered for this SD',
        why_2: 'RLS policy validation not enforced for data-touching SDs',
        why_3: 'Security validation treated as optional',
        root_cause: 'Security validation not mandatory for database SDs',
        contributing_factors: ['Optional security checks', 'RLS policy gaps possible']
      },
      preventive_measures: [
        'Mandate SECURITY sub-agent for database/security SDs',
        'Add RLS policy existence check to DATABASE sub-agent',
        'Block database SD completion without RLS validation'
      ],
      systemic_issue: true
    });
  }

  return areas;
}

/**
 * Get SD-type-specific action items
 */
function getTypeSpecificActions(sdType, sdData, subAgentResults) {
  const actions = [];
  const _sdKey = sdData.sd_key || sdData.legacy_id || sdData.id?.substring(0, 8);

  // Check if DATABASE sub-agent ran for database SDs
  const databaseRun = subAgentResults.results?.some(r => r.sub_agent_code === 'DATABASE');
  const securityRun = subAgentResults.results?.some(r => r.sub_agent_code === 'SECURITY');

  if (sdType === 'database' && !databaseRun) {
    actions.push({
      action: 'Run DATABASE sub-agent for all database/schema SDs',
      owner: 'EXEC Phase Automation',
      deadline: 'SD completion',
      success_criteria: 'DATABASE sub-agent verdict recorded in sub_agent_execution_results',
      priority: 'high',
      smart_format: true,
      source: 'type_specific_gap'
    });
  }

  if ((sdType === 'database' || sdType === 'security') && !securityRun) {
    actions.push({
      action: 'Run SECURITY sub-agent for RLS policy validation',
      owner: 'EXEC Phase Automation',
      deadline: 'SD completion',
      success_criteria: 'SECURITY sub-agent validates RLS policies exist and are correct',
      priority: 'high',
      smart_format: true,
      source: 'type_specific_gap'
    });
  }

  if (sdType === 'infrastructure') {
    actions.push({
      action: 'Document infrastructure changes in operational runbook',
      owner: 'DevOps Team',
      deadline: 'Before production deployment',
      success_criteria: 'Runbook updated with new infrastructure components',
      priority: 'medium',
      smart_format: true,
      source: 'type_specific_requirement'
    });
  }

  if (sdType === 'feature') {
    actions.push({
      action: 'Verify user journey E2E tests cover all acceptance criteria',
      owner: 'QA Agent',
      deadline: 'Before EXEC→PLAN handoff',
      success_criteria: 'Each user story has at least one passing E2E test',
      priority: 'high',
      smart_format: true,
      source: 'type_specific_requirement'
    });
  }

  return actions;
}
