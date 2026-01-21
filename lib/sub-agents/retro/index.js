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
 * Modularized structure:
 * - index.js: Main entry point and execute function
 * - utils.js: Utility functions
 * - db-operations.js: Database operations
 * - analyzers.js: Data analysis functions
 * - generators.js: Content generation
 * - action-items.js: Action item helpers
 * - lesson-capture.js: Lesson mode functionality
 * - audit-retro.js: Audit retrospective generation
 */

import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../../scripts/lib/supabase-connection.js';
import { batchQuery } from '../../utils/batch-db-operations.js';
import { getLatestTestEvidence, getStoryTestCoverage } from '../../../scripts/lib/test-evidence-ingest.js';

import { stripNestedFindings, semanticDeduplicateArray } from './utils.js';
import {
  checkExistingRetrospective,
  gatherSDMetadata,
  storeRetrospective,
  enhanceRetrospective
} from './db-operations.js';
import { generateRetrospective } from './generators.js';
import { captureLessonLearned } from './lesson-capture.js';
import { generateAuditRetrospective } from './audit-retro.js';

dotenv.config();

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
  const isAuditMode = mode === 'audit_retro';

  if (isAuditMode) {
    console.log(`\n📋 Starting RETRO (AUDIT MODE) for ${options.auditContext?.audit_file_path || 'unknown audit'}...`);
    console.log('   Continuous Improvement Coach - Audit Retrospective Generation');
  } else if (isLessonMode) {
    console.log(`\n📝 Starting RETRO (LESSON MODE) for ${sdId}...`);
    console.log('   Continuous Improvement Coach - Ad-Hoc Lesson Capture');
  } else {
    console.log(`\n🔄 Starting RETRO for ${sdId}...`);
    console.log('   Continuous Improvement Coach - Retrospective Generation');
  }

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
    console.log('\n📊 Phase 1: Gathering SD metadata...');
    const sdData = await gatherSDMetadata(supabase, sdId);
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

    if (isLessonMode) {
      return await captureLessonLearned(supabase, sdId, sdData, options, results);
    }

    if (isAuditMode) {
      return await generateAuditRetrospective(supabase, options.auditContext, results);
    }

    console.log('\n🔍 Phase 1.5: Checking for valid completion retrospective...');
    const existingRetro = await checkExistingRetrospective(supabase, sdId);

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

    const needsEnhancement = existingRetro.needs_enhancement;
    const existingRetroId = existingRetro.existing_retro_id;

    if (needsEnhancement) {
      console.log(`   🔄 Will enhance existing retrospective: ${existingRetroId}`);
    } else {
      console.log('   ℹ️  No existing retrospective found - will generate new one');
    }

    console.log('\n⚡ Phases 2-4: Gathering PRD, handoffs, and sub-agent results in parallel...');

    const batchResults = await batchQuery([
      {
        name: 'prd',
        table: 'product_requirements_v2',
        select: 'id, directive_id, title, functional_requirements, planned_end',
        filters: { directive_id: sdId },
        options: { maybeSingle: true }
      },
      {
        name: 'handoffs',
        table: 'sd_phase_handoffs',
        select: 'id, sd_id, handoff_type, created_at',
        filters: { sd_id: sdId },
        options: { order: { column: 'created_at', ascending: true } }
      },
      {
        name: 'sub_agent_results',
        table: 'sub_agent_execution_results',
        select: 'id, sd_id, sub_agent_code, sub_agent_name, verdict, confidence, created_at',
        filters: { sd_id: sdId },
        options: { order: { column: 'created_at', ascending: true } }
      },
      {
        name: 'deliverables',
        table: 'sd_scope_deliverables',
        select: 'id, sd_id, deliverable_name, deliverable_type, priority, completion_status',
        filters: { sd_id: sdId }
      }
    ]);

    console.log(`   ⏱️  Parallel queries completed in ${batchResults.timing.total_ms}ms`);

    const prdData = batchResults.data.prd
      ? { found: true, prd: batchResults.data.prd }
      : { found: false, error: batchResults.errors.prd };
    results.findings.prd_data = prdData;

    if (prdData.found) {
      console.log(`   ✅ PRD found: ${prdData.prd.title}`);
    } else {
      console.log('   ⚠️  No PRD found');
    }

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

    const subAgentList = batchResults.data.sub_agent_results || [];
    const strippedResults = stripNestedFindings(subAgentList);
    const subAgentResults = {
      found: true,
      count: strippedResults.length,
      results: strippedResults
    };
    results.findings.sub_agent_results = subAgentResults;

    console.log(`   ✅ Found ${subAgentResults.count} sub-agent execution(s)`);
    if (subAgentResults.count > 0) {
      const agents = [...new Set(subAgentResults.results.map(r => r.sub_agent_code))];
      console.log(`      Agents: ${agents.join(', ')}`);
    }

    const deliverablesList = batchResults.data.deliverables || [];
    const deliverables = {
      found: deliverablesList.length > 0,
      count: deliverablesList.length,
      items: deliverablesList
    };
    results.findings.deliverables = deliverables;

    if (deliverables.found) {
      const completed = deliverablesList.filter(d => d.completion_status === 'completed').length;
      const required = deliverablesList.filter(d => d.priority === 'required').length;
      console.log(`   ✅ Found ${deliverables.count} deliverable(s): ${completed} completed, ${required} required`);
    } else {
      console.log('   ℹ️  No scope deliverables tracked (legacy SD)');
    }

    console.log('\n🧪 Phase 4.5: Gathering test evidence (LEO v4.3.4)...');
    let testEvidence = null;
    let storyCoverage = { total_stories: 0, passing_count: 0 };
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

      storyCoverage = await getStoryTestCoverage(sdId);
      if (storyCoverage.total_stories > 0) {
        console.log(`   📊 Story coverage: ${storyCoverage.passing_count}/${storyCoverage.total_stories} stories passing`);
        results.findings.story_coverage = storyCoverage;
      }
    } catch (testError) {
      console.log(`   ⚠️  Could not retrieve test evidence: ${testError.message}`);
    }

    console.log('\n📝 Phase 5: Generating retrospective...');
    const retrospective = generateRetrospective(sdData, prdData, handoffs, subAgentResults, options, testEvidence, deliverables, storyCoverage);
    results.findings.retrospective = retrospective;

    console.log('   ✅ Retrospective generated');
    console.log(`      Quality Score: ${retrospective.quality_score}/100`);
    console.log(`      Team Satisfaction: ${retrospective.team_satisfaction}/10`);
    console.log(`      Key Learnings: ${retrospective.key_learnings.length}`);

    if (!options.dry_run) {
      console.log('\n💾 Phase 6: Storing retrospective...');

      let stored;
      if (needsEnhancement && existingRetroId) {
        console.log(`   🔄 Enhancing existing retrospective: ${existingRetroId}`);
        stored = await enhanceRetrospective(supabase, existingRetroId, retrospective, existingRetro.existing_retro, semanticDeduplicateArray);
      } else {
        stored = await storeRetrospective(supabase, retrospective);
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
