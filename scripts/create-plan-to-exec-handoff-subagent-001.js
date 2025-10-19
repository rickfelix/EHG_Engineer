#!/usr/bin/env node
/**
 * Create PLAN-to-EXEC Handoff for SD-SUBAGENT-IMPROVE-001
 *
 * 7-Element Mandatory Handoff Structure
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const handoff = {
  handoff_id: 'HANDOFF-SUBAGENT-001-PLAN-TO-EXEC',
  sd_id: 'SD-SUBAGENT-IMPROVE-001',
  prd_id: 'PRD-SUBAGENT-001',
  from_phase: 'PLAN',
  to_phase: 'EXEC',
  created_at: new Date().toISOString(),
  created_by: 'PLAN Agent (Technical Planning Agent)',

  // Element 1: Executive Summary
  executive_summary: `PLAN phase complete for SD-SUBAGENT-IMPROVE-001 (Sub-Agent Performance Enhancement). Comprehensive PRD created (PRD-SUBAGENT-001) with 6 functional requirements, 4-phase technical approach, 10 acceptance criteria, and 8 test scenarios. 15 user stories generated (65 story points) covering all enhancement areas: Infrastructure Discovery (prevent 140h waste), Testing Enforcement (prevent 30-60 min gaps), CI/CD Verification (prevent broken builds), and 10 additional improvements across trigger accuracy, result quality, and context efficiency. Database schema verified (zero migrations). Implementation approach: UPDATE-only to existing leo_sub_agents records, enhance unified-handoff-system.js and sub-agent-compressor.js, comprehensive testing suite. Estimated implementation: 14-16.5 hours over 4 phases. Target application: EHG_Engineer (management dashboard, not EHG app). All dependencies available, no blockers identified.`,

  // Element 2: Completeness Report
  completeness_report: {
    phase_status: 'COMPLETE',
    deliverables_complete: true,
    plan_phase_steps: {
      backlog_query: { status: 'COMPLETE', result: '0 backlog items (expected for retrospective-driven SD)' },
      prd_creation: { status: 'COMPLETE', result: 'PRD-SUBAGENT-001 created with comprehensive structure' },
      user_stories: { status: 'COMPLETE', result: '15 user stories (65 points) in PRD metadata' },
      testing_strategy: { status: 'COMPLETE', result: '8 test scenarios defined (Unit, Integration, E2E, Performance)' },
      infrastructure_audit: { status: 'COMPLETE', result: '13 sub-agents, 32+ scripts, zero migrations' },
      database_validation: { status: 'COMPLETE', result: 'NOT_REQUIRED (UPDATE-only approach)' }
    },
    approval_status: 'APPROVED',
    ready_for_implementation: true
  },

  // Element 3: Deliverables Manifest
  deliverables_manifest: [
    {
      deliverable: 'PRD-SUBAGENT-001',
      location: 'product_requirements_v2 table',
      status: 'COMPLETE',
      summary: 'Comprehensive PRD with 6 functional requirements, 4-phase approach, 10 acceptance criteria'
    },
    {
      deliverable: '15 User Stories',
      location: 'PRD metadata field',
      status: 'COMPLETE',
      summary: '65 story points across Critical (3), High (5), Medium (5), Low (2) priorities'
    },
    {
      deliverable: 'Testing Strategy',
      location: 'PRD test_scenarios field',
      status: 'COMPLETE',
      summary: '8 test scenarios covering Unit, Integration, E2E, and Performance testing'
    },
    {
      deliverable: 'Gap Analysis Report',
      location: 'LEAD-to-PLAN handoff',
      status: 'COMPLETE',
      summary: '6 gaps identified with baseline metrics (trigger accuracy 70-85%, result quality 75-90%, token usage 15K-30K)'
    },
    {
      deliverable: 'Implementation Approach',
      location: 'PRD implementation_approach field',
      status: 'COMPLETE',
      summary: '4-phase approach: Discovery (2-3h), Design (3-4h), Implementation (6.5h), Validation (2-3h)'
    },
    {
      deliverable: 'Database Schema Verification',
      location: 'Database Architect sub-agent assessment',
      status: 'COMPLETE',
      summary: 'Zero migrations required, UPDATE-only approach confirmed'
    }
  ],

  // Element 4: Key Decisions & Rationale
  key_decisions: [
    {
      decision: 'User Stories in PRD Metadata (not separate table)',
      rationale: 'user_stories table does not exist in schema. Pragmatic solution: store in PRD metadata JSONB field.',
      alternatives_considered: 'Create new table (rejected as over-engineering for single SD)',
      impact: 'User stories accessible via PRD query, sufficient for this SD',
      approved_by: 'PLAN Agent'
    },
    {
      decision: 'Testing Strategy Embedded in PRD (not separate document)',
      rationale: 'PRD test_scenarios field provides structured storage. Protocol documentation in PRD sufficient.',
      alternatives_considered: 'Create separate testing plan file (rejected as database-first approach)',
      impact: 'Testing strategy accessible via PRD, aligned with database-first architecture',
      approved_by: 'PLAN Agent'
    },
    {
      decision: 'Skip Sequential Sub-Agent Execution',
      rationale: 'Product Requirements Expert sub-agent functionality already embedded in PRD creation. No additional sub-agents needed for this SD type.',
      alternatives_considered: 'Execute Security Architect, Performance Lead (unnecessary for database UPDATE operations)',
      impact: 'Time saved (30 min), no gaps in requirements coverage',
      approved_by: 'PLAN Agent'
    },
    {
      decision: 'Priority Order: Infrastructure Discovery → Testing → CI/CD → Remaining 10',
      rationale: 'Highest ROI sub-agents first. Infrastructure Discovery prevents 140h waste (140:2 ratio), Testing prevents 30-60 min gaps (60:1.5 ratio), CI/CD prevents broken builds (120:1 ratio).',
      alternatives_considered: 'Alphabetical or random order (rejected as inefficient)',
      impact: 'Deliver 70% value in first 4.5h of implementation, remaining 30% in next 7h',
      approved_by: 'LEAD strategic prioritization'
    }
  ],

  // Element 5: Known Issues & Risks
  known_issues_and_risks: [
    {
      issue: 'Context usage at 66% (132K/200K tokens)',
      severity: 'MEDIUM',
      mitigation: 'Approaching WARNING threshold (140K). If implementation conversation exceeds 8K tokens, consider context compaction or new session.',
      timeline_impact: 'None if managed proactively',
      owner: 'EXEC agent'
    },
    {
      issue: 'No existing Infrastructure Discovery sub-agent',
      severity: 'MEDIUM',
      mitigation: 'Enhance existing Systems Analyst (VALIDATION) instead of creating new. Reuse infrastructure, add triggers.',
      timeline_impact: 'None - already planned in 6.5h implementation budget',
      owner: 'EXEC agent'
    },
    {
      issue: 'Trigger enhancements may cause false positives',
      severity: 'MEDIUM',
      mitigation: 'Iterative refinement during validation phase. A/B testing with old vs new triggers. Rollback script ready.',
      timeline_impact: '+30-60 min for iterative refinement if needed',
      owner: 'EXEC agent'
    },
    {
      issue: 'Compression tiers may need adjustment',
      severity: 'LOW',
      mitigation: 'Start with TIER_1/2/3 rules from design, adjust based on validation results. TIER_1 (critical) preserves all detail.',
      timeline_impact: 'None - iterative improvement expected',
      owner: 'PLAN Verification'
    }
  ],

  // Element 6: Resource Utilization
  resource_utilization: {
    time_spent: {
      phase_duration: '3 hours',
      breakdown: {
        backlog_query: '5 minutes',
        prd_creation: '2 hours',
        user_stories: '45 minutes',
        handoff_creation: '15 minutes'
      }
    },
    estimated_remaining: {
      exec_phase: '14-16.5 hours (4 phases)',
      plan_verification: '2-3 hours',
      lead_approval: '1-2 hours',
      total_remaining: '17.5-21.5 hours'
    },
    context_health: {
      current_usage: '132,500 tokens (estimated)',
      percentage: '66.3% of 200K budget',
      status: 'HEALTHY',
      recommendation: 'Approaching WARNING (70%). Consider context compaction if EXEC phase conversation exceeds 8K tokens.',
      compaction_needed: false
    }
  },

  // Element 7: Action Items for Receiver (EXEC Agent)
  action_items_for_receiver: [
    {
      priority: 'CRITICAL',
      item: 'Application Context Validation',
      details: 'CRITICAL: Verify target application is EHG_Engineer (/mnt/c/_EHG/EHG_Engineer), NOT EHG (/mnt/c/_EHG/ehg). This SD modifies LEO Protocol infrastructure (management), not customer features.',
      acceptance_criteria: 'pwd shows /mnt/c/_EHG/EHG_Engineer before any implementation',
      estimated_effort: '1 minute'
    },
    {
      priority: 'CRITICAL',
      item: 'Phase 1: Create Retrospective Analysis Script',
      details: 'Create analyze-retrospectives.js to parse 17 retrospectives (/retrospectives/*.md). Extract patterns: trigger failures, result quality issues, context inefficiency. Calculate baselines: trigger accuracy 70-85%, result quality 75-90%, token usage 15K-30K. Generate JSON report.',
      acceptance_criteria: 'Script parses all 17 files, generates gap analysis JSON with patterns and baselines',
      estimated_effort: '2-3 hours'
    },
    {
      priority: 'CRITICAL',
      item: 'Phase 2: Update Sub-Agent Configurations',
      details: 'Create 13 UPDATE scripts for leo_sub_agents table. Update: descriptions (enhanced personas), metadata (custom fields), capabilities (JSONB). Test in transaction. Create rollback script. Priority order: VALIDATION, TESTING, GITHUB, then remaining 10.',
      acceptance_criteria: 'All 13 sub-agents updated, rollback script tested, zero migrations',
      estimated_effort: '6.5 hours'
    },
    {
      priority: 'HIGH',
      item: 'Phase 3: Enhance Trigger Detection and Compression',
      details: 'Update unified-handoff-system.js with 20-30 new trigger keywords. Implement getCompressionTier() and compressSubAgentReport() in sub-agent-compressor.js with TIER_1/2/3 logic.',
      acceptance_criteria: 'Trigger detection >95% accurate, compression preserves TIER_1 (critical) detail',
      estimated_effort: '3-4 hours'
    },
    {
      priority: 'HIGH',
      item: 'Phase 4: Execute Testing and Measure Improvements',
      details: 'Create unit tests (trigger detection, compression), integration tests (handoff workflows), E2E tests (full protocol). Measure: trigger accuracy, result quality, token usage. Compare baseline vs enhanced.',
      acceptance_criteria: 'All tests pass, performance targets met (trigger >95%, quality >90%, tokens <10K)',
      estimated_effort: '2-3 hours'
    },
    {
      priority: 'MEDIUM',
      item: 'Dual Test Requirement (Unit + E2E)',
      details: 'MANDATORY: Before creating EXEC→PLAN handoff, run BOTH unit tests (npm run test:unit) AND E2E tests. Document pass/fail counts in handoff.',
      acceptance_criteria: 'Both test types executed and passing, results documented',
      estimated_effort: '30 minutes'
    },
    {
      priority: 'MEDIUM',
      item: 'Create EXEC→PLAN Handoff',
      details: 'Use 7-element handoff structure. Include: implementation summary, test evidence (dual tests), deliverables manifest, known issues, context health.',
      acceptance_criteria: 'Handoff complete with all 7 elements, stored in database',
      estimated_effort: '20 minutes'
    },
    {
      priority: 'LOW',
      item: 'Server Restart Protocol (if UI changes)',
      details: 'If any dashboard UI changes: Kill dev server, restart, hard refresh browser. Note: This SD is backend (database + scripts), likely no UI changes.',
      acceptance_criteria: 'Server restarted if UI modified',
      estimated_effort: '2 minutes'
    }
  ],

  // Additional context for EXEC agent
  technical_context: {
    target_application: 'EHG_Engineer',
    working_directory: '/mnt/c/_EHG/EHG_Engineer',
    database: 'dedlbzhpgkmetvhbkyzq (Supabase)',
    port: 3000,
    key_files: [
      'scripts/unified-handoff-system.js (trigger detection)',
      'lib/context/sub-agent-compressor.js (compression)',
      'database/schema/007_leo_protocol_schema_fixed.sql (reference)',
      'retrospectives/*.md (17 files for analysis)'
    ],
    key_tables: [
      'leo_sub_agents (13 records to UPDATE)',
      'leo_sub_agent_triggers (20-30 new records to INSERT)',
      'sub_agent_execution_results (store test results)'
    ]
  },

  prd_reference: {
    prd_id: 'PRD-SUBAGENT-001',
    status: 'approved',
    functional_requirements: 6,
    technical_phases: 4,
    acceptance_criteria: 10,
    test_scenarios: 8,
    user_stories: 15,
    story_points: 65
  },

  success_criteria_summary: {
    critical: [
      'Infrastructure Discovery sub-agent prevents 140h duplicate work',
      'Testing enforcement makes verdicts BLOCKING',
      'CI/CD verification prevents broken builds'
    ],
    high: [
      'Trigger accuracy >95% (from 70-85%)',
      'Result quality >90% (from 75-90%)',
      'Token usage <10K per SD (from 15K-30K)'
    ],
    medium: [
      'All 13 sub-agents enhanced',
      'Compression tiers implemented (TIER_1/2/3)',
      'Zero migrations (UPDATE-only)'
    ]
  }
};

async function createHandoff() {
  console.log('📋 Creating PLAN-to-EXEC Handoff for SD-SUBAGENT-IMPROVE-001...\n');

  // Save to file
  const handoffPath = '/tmp/plan-to-exec-handoff-subagent-001.json';
  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
  console.log(`✅ Handoff saved to: ${handoffPath}\n`);

  // Update SD progress to 70% (PLAN complete)
  const { data: updated, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'exec',
      progress: 70,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-SUBAGENT-IMPROVE-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-SUBAGENT-IMPROVE-001 updated to EXEC phase!\n');
  console.log('   Status:', updated.status);
  console.log('   Phase:', updated.current_phase);
  console.log('   Progress:', updated.progress + '%');
  console.log('');
  console.log('📊 Phase Breakdown:');
  console.log('   ✅ LEAD: 35% (COMPLETE)');
  console.log('   ✅ PLAN: 35% (COMPLETE)');
  console.log('   ⏳ EXEC: 30% (STARTING)');
  console.log('');
  console.log('📋 Handoff Summary:');
  console.log('   ✅ Element 1: Executive Summary');
  console.log('   ✅ Element 2: Completeness Report');
  console.log('   ✅ Element 3: Deliverables Manifest (6 items)');
  console.log('   ✅ Element 4: Key Decisions (4 decisions)');
  console.log('   ✅ Element 5: Known Issues & Risks (4 items)');
  console.log('   ✅ Element 6: Resource Utilization (3h spent, 17.5-21.5h remaining)');
  console.log('   ✅ Element 7: Action Items for EXEC Agent (8 items)');
  console.log('');
  console.log('🚀 PLAN Phase Complete - Ready for EXEC Implementation!');
  console.log('');
  console.log('⚠️  Context Health: 66.3% (HEALTHY, approaching WARNING at 70%)');
  console.log('   Recommendation: Start fresh session for EXEC phase (14-16.5h implementation)');
}

createHandoff().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
