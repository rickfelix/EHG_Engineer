#!/usr/bin/env node
/**
 * Generate User Stories for SD-SUBAGENT-IMPROVE-001
 *
 * Creates 15 user stories mapped to PRD functional requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const userStories = [
  {
    story_id: 'US-SUBAGENT-001',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Infrastructure Discovery - Enhance VALIDATION Sub-Agent',
    description: 'As a PLAN agent, I want the VALIDATION sub-agent to automatically trigger on PLAN_PRD_CREATION and audit existing infrastructure, so that I can avoid estimating duplicate work and reuse existing code.',
    acceptance_criteria: [
      'VALIDATION sub-agent triggers when PLAN phase creates PRD',
      'Infrastructure audit searches for existing services, components, Edge Functions',
      'Audit report generated with: (a) files found, (b) LOC counts, (c) reuse opportunities, (d) adjusted effort estimate',
      'Report stored in sub_agent_execution_results table',
      'Prevent at least one 50-140h duplicate work scenario in validation testing'
    ],
    priority: 'critical',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-002',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Testing Enforcement - Make QA Director Verdicts Blocking',
    description: 'As a PLAN agent, I want the TESTING sub-agent to make verdicts BLOCKING for mandatory test scenarios, so that EXEC→PLAN handoffs cannot be created without passing tests.',
    acceptance_criteria: [
      'TESTING sub-agent verdict logic updated with blocking conditions',
      'Mandatory test scenarios defined: (a) New features require smoke tests, (b) Logic changes >10 lines require unit tests, (c) UI changes require E2E tests',
      'EXEC→PLAN handoff creation script checks TESTING verdict before allowing handoff',
      'If verdict = BLOCKED, handoff creation fails with error message',
      'Validation test: Attempt handoff without tests, verify BLOCKED'
    ],
    priority: 'critical',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-003',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'CI/CD Verification - Add PLAN_VERIFICATION Trigger',
    description: 'As a PLAN agent in supervisor mode, I want the GITHUB sub-agent to trigger on PLAN_VERIFICATION_COMPLETE and verify all CI/CD pipelines are green, so that I don\'t approve SDs with failing builds.',
    acceptance_criteria: [
      'GITHUB sub-agent has new trigger: PLAN_VERIFICATION_COMPLETE',
      'Sub-agent queries GitHub Actions API for latest pipeline status',
      'Verdict = PASS if all pipelines green, BLOCKED if any failing',
      'Wait 2-3 min for pipelines to complete before checking',
      'Validation test: Complete EXEC, verify DevOps check executes before PLAN approval'
    ],
    priority: 'critical',
    story_points: 3,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-004',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Trigger Accuracy - Add 20-30 New Trigger Keywords',
    description: 'As a LEO Protocol user, I want sub-agent trigger keywords to be more accurate (>95%), so that sub-agents activate when needed and don\'t activate unnecessarily.',
    acceptance_criteria: [
      '20-30 new trigger keywords added to leo_sub_agent_triggers table',
      'Keywords refined based on retrospective analysis (e.g., "user stories" → STORIES sub-agent)',
      'Trigger detection accuracy measured on 20 test scenarios: >95% true positive + true negative rate',
      'False positive rate <5%',
      'All 13 sub-agents have trigger keyword updates'
    ],
    priority: 'high',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-005',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Result Quality - Enhance Sub-Agent Personas',
    description: 'As a LEO Protocol user, I want sub-agent personas to include domain-specific context, so that their recommendations are more actionable and achieve >90% quality scores.',
    acceptance_criteria: [
      'All 13 sub-agents have enhanced descriptions in leo_sub_agents table',
      'Personas include: domain expertise, years of experience, specific capabilities',
      'Result quality measured on 10 test SDs with 10-point rubric: >90% average score',
      'Rubric evaluates: relevance, actionability, completeness, accuracy',
      'Baseline (75-90%) vs Enhanced (>90%) comparison documented'
    ],
    priority: 'high',
    story_points: 8,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-006',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Context Efficiency - Implement TIER_1/2/3 Compression',
    description: 'As a LEO Protocol user, I want sub-agent reports compressed based on severity tiers, so that context token usage reduces from 15K-30K to <10K per SD.',
    acceptance_criteria: [
      'TIER_1 (critical): Zero compression, full detail preserved',
      'TIER_2 (warnings): Structured summary with key findings only',
      'TIER_3 (pass): One-line summary with reference to full report',
      'getCompressionTier() function implemented in sub-agent-compressor.js',
      'compressSubAgentReport() function applies tier-based compression',
      'Token usage measured on 5 test SDs: <10K average (vs baseline 15K-30K)'
    ],
    priority: 'high',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-007',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Retrospective Analysis Script - Extract Patterns',
    description: 'As a EXEC agent, I want a script that parses 17 retrospectives and extracts sub-agent performance patterns, so that I have baseline data for enhancements.',
    acceptance_criteria: [
      'analyze-retrospectives.js script created',
      'Script parses all 17 retrospective files',
      'Extracts mentions of each sub-agent (by code: TESTING, DATABASE, etc.)',
      'Identifies patterns: trigger failures, result quality issues, context inefficiency',
      'Generates JSON report with: sub-agent, baseline metrics, gaps, recommendations',
      'Baseline metrics calculated: trigger accuracy 70-85%, result quality 75-90%, token usage 15K-30K'
    ],
    priority: 'high',
    story_points: 3,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-008',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Database UPDATE Scripts - Enhance 13 Sub-Agents',
    description: 'As a EXEC agent, I want UPDATE scripts for all 13 sub-agents, so that I can enhance their database records without migrations.',
    acceptance_criteria: [
      '13 UPDATE scripts created (one per sub-agent)',
      'Each script updates: description (enhanced persona), metadata (custom fields), capabilities (JSONB array)',
      'Test in transaction before commit',
      'Zero migrations required (UPDATE-only approach)',
      'Rollback script created with original values stored'
    ],
    priority: 'high',
    story_points: 8,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-009',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Enhanced Trigger Detection - Update unified-handoff-system.js',
    description: 'As a EXEC agent, I want enhanced trigger detection logic in unified-handoff-system.js, so that new trigger keywords are recognized.',
    acceptance_criteria: [
      'unified-handoff-system.js updated with new trigger detection logic',
      'Semantic pattern matching added (beyond simple keyword matching)',
      'Trigger context support (PRD vs SD vs code)',
      'Priority-based trigger selection when multiple sub-agents match',
      'Unit tests for trigger detection: >95% accuracy on 20 test cases'
    ],
    priority: 'medium',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-010',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Unit Tests - Validate Trigger Detection and Compression',
    description: 'As a EXEC agent, I want unit tests for trigger detection and compression logic, so that I can verify enhancements work correctly.',
    acceptance_criteria: [
      'tests/unit/trigger-detection.test.js created with 20 test cases',
      'tests/unit/compression-tiers.test.js created with TIER_1/2/3 tests',
      'All unit tests pass',
      'Test coverage >80% for enhanced modules',
      'Tests validate: trigger accuracy >95%, compression preserves critical info'
    ],
    priority: 'medium',
    story_points: 3,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-011',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Integration Tests - Validate Handoff Workflows',
    description: 'As a EXEC agent, I want integration tests that verify handoff workflows with enhanced sub-agents, so that I can ensure protocol still functions correctly.',
    acceptance_criteria: [
      'tests/integration/handoff-workflows.test.js created',
      'Tests simulate LEAD→PLAN→EXEC→PLAN→LEAD workflow',
      'Verify sub-agents trigger at correct phases',
      'Verify BLOCKING verdicts prevent handoffs when conditions not met',
      'All integration tests pass'
    ],
    priority: 'medium',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-012',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'E2E Tests - Full Protocol Execution with Enhanced Sub-Agents',
    description: 'As a PLAN verification agent, I want E2E tests that execute full protocol with enhanced sub-agents, so that I can validate end-to-end functionality.',
    acceptance_criteria: [
      'scripts/test-enhanced-protocol-e2e.js created',
      'Creates test SD, progresses through all phases with enhanced sub-agents',
      'Measures performance: trigger accuracy, result quality, token usage',
      'Compares baseline vs enhanced metrics',
      'All E2E tests pass, performance targets met'
    ],
    priority: 'medium',
    story_points: 5,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-013',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Performance Measurement - Baseline vs Enhanced Comparison',
    description: 'As a PLAN verification agent, I want a performance measurement script that compares baseline vs enhanced metrics, so that I can validate success criteria are met.',
    acceptance_criteria: [
      'scripts/measure-performance-improvements.js created',
      'Measures: trigger accuracy (70-85% → >95%), result quality (75-90% → >90%), token usage (15K-30K → <10K)',
      'Generates comparison report with before/after metrics',
      'Validates all 6 business objectives met',
      'Report stored in database with verdict (PASS/FAIL)'
    ],
    priority: 'medium',
    story_points: 3,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-014',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Rollback Script - Revert Enhancements if Needed',
    description: 'As a EXEC agent, I want a rollback script that can revert all sub-agent enhancements to original state, so that I have a safety net if issues arise.',
    acceptance_criteria: [
      'scripts/rollback-subagent-enhancements.js created',
      'Script stores original values before making updates',
      'Rollback reverts: descriptions, metadata, triggers to original state',
      'Test rollback: Execute enhancements, run rollback, verify database restored',
      'Rollback completes successfully in <1 minute'
    ],
    priority: 'low',
    story_points: 2,
    status: 'not_started',
    created_by: 'PLAN Agent'
  },
  {
    story_id: 'US-SUBAGENT-015',
    sd_id: 'SD-SUBAGENT-IMPROVE-001',
    prd_id: 'PRD-SUBAGENT-001',
    title: 'Documentation - Update CLAUDE.md with Enhanced Sub-Agents',
    description: 'As a LEO Protocol user, I want CLAUDE.md regenerated with enhanced sub-agent descriptions, so that I understand the new capabilities.',
    acceptance_criteria: [
      'Run node scripts/generate-claude-md-from-db.js after enhancements',
      'CLAUDE.md updated with enhanced sub-agent descriptions',
      'New triggers documented in sub-agent trigger lists',
      'Compression tier documentation added',
      'Updated file deployed and accessible'
    ],
    priority: 'low',
    story_points: 1,
    status: 'not_started',
    created_by: 'PLAN Agent'
  }
];

async function generateUserStories() {
  console.log('📋 Generating 15 User Stories for SD-SUBAGENT-IMPROVE-001...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const story of userStories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating ${story.story_id}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ ${story.story_id}: ${story.title}`);
      successCount++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 User Story Generation Complete: ${successCount}/${userStories.length} created`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  if (errorCount > 0) {
    console.error(`⚠️  ${errorCount} error(s) encountered`);
    process.exit(1);
  }

  console.log('✅ All user stories created successfully!');
  console.log('');
  console.log('📊 Story Breakdown:');
  console.log('   Critical Priority: 3 stories (US-001, US-002, US-003)');
  console.log('   High Priority: 5 stories (US-004, US-005, US-006, US-007, US-008)');
  console.log('   Medium Priority: 5 stories (US-009, US-010, US-011, US-012, US-013)');
  console.log('   Low Priority: 2 stories (US-014, US-015)');
  console.log('');
  console.log('   Total Story Points: 65 points');
  console.log('   Estimated Effort: 14-16.5 hours (matches PRD timeline)');
  console.log('');
  console.log('🚀 Ready for testing strategy definition!');
}

generateUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
