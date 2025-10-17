#!/usr/bin/env node
/**
 * Create PRD for SD-SUBAGENT-IMPROVE-001 (Schema-Compliant Version)
 *
 * Comprehensive Product Requirements Document for Sub-Agent Performance Enhancement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const prd = {
  id: 'PRD-SUBAGENT-001',
  directive_id: 'SD-SUBAGENT-IMPROVE-001',
  title: 'Sub-Agent Performance Enhancement: Data-Driven Optimization Initiative',
  status: 'approved',
  version: '1.0',
  category: 'LEO Protocol Enhancement',
  priority: 'high',

  executive_summary: `This PRD defines the technical approach for systematically improving all 13 LEO Protocol sub-agents based on data-driven retrospective analysis. Gap analysis identified 6 performance gaps across trigger accuracy (70-85% → >95%), result quality (75-90% → >90%), and context token efficiency (15K-30K → <10K per SD). Implementation follows 4-phase approach: Discovery (extract patterns from 17 retrospectives), Design (create enhancement specs for 13 sub-agents), Implementation (UPDATE database configurations), and Validation (measure improvements against baselines). CRITICAL ENHANCEMENTS: Infrastructure Discovery sub-agent (prevent 140h duplicate work), Testing enforcement (prevent 30-60 min gaps), CI/CD verification (prevent broken builds).`,

  business_context: `Sub-agents are specialists within the LEO Protocol that provide domain expertise (Security, Database, Testing, Performance, etc.). Current performance analysis reveals significant gaps: trigger detection accuracy 70-85% (false positives and missed activations), result quality scores 75-90% (inconsistent recommendations), context token usage 15K-30K per SD (causing bloat). Retrospectives from SD-UAT-002, SD-LEO-002, SD-BACKEND-001 document specific failures: missing infrastructure audits (140h waste), testing not enforced (30-60 min gaps), CI/CD verification missing. User demand is high (8/10) for systematic improvement. This initiative delivers exceptional ROI: Infrastructure Discovery alone prevents 50-140h duplicate work per SD (140:2 ratio).`,

  technical_context: `LEO Protocol architecture: Database-first with 13 active sub-agents in leo_sub_agents table (DOCMON, UAT, GITHUB, RETRO, DESIGN, RESEARCH, STORIES, FINANCIAL_ANALYTICS, SECURITY, DATABASE, TESTING, PERFORMANCE, VALIDATION). Existing infrastructure: unified-handoff-system.js (trigger detection), sub-agent-compressor.js (result compression), sub_agent_execution_results table (performance tracking). Database Architect verification confirms schema supports all enhancements via UPDATE statements (zero migrations). Implementation approach: UPDATE-only to existing records, JSONB metadata for custom fields, new triggers in leo_sub_agent_triggers table, enhanced logic in existing scripts. Rollback strategy: Store original values, create revert script, test in transaction before commit.`,

  functional_requirements: [
    {
      id: 'FR-1',
      category: 'Infrastructure Discovery',
      requirement: 'Enhance Systems Analyst (VALIDATION) sub-agent to trigger on PLAN_PRD_CREATION and audit existing infrastructure before estimation',
      business_value: 'Prevent 50-140h duplicate work per SD',
      priority: 'CRITICAL',
      acceptance_criteria: 'VALIDATION sub-agent executes during PLAN phase, generates infrastructure audit report with code reuse opportunities'
    },
    {
      id: 'FR-2',
      category: 'Testing Enforcement',
      requirement: 'Update QA Engineering Director (TESTING) sub-agent to make verdicts BLOCKING for mandatory test scenarios',
      business_value: 'Prevent 30-60 min gaps between "complete" and test failures',
      priority: 'CRITICAL',
      acceptance_criteria: 'EXEC→PLAN handoff creation BLOCKED if mandatory tests not passed'
    },
    {
      id: 'FR-3',
      category: 'CI/CD Verification',
      requirement: 'Add PLAN_VERIFICATION_COMPLETE trigger to DevOps Platform Architect (GITHUB) sub-agent to check pipeline status',
      business_value: 'Prevent broken build deployments',
      priority: 'CRITICAL',
      acceptance_criteria: 'DevOps sub-agent executes during PLAN verification, verifies all GitHub Actions pipelines are green'
    },
    {
      id: 'FR-4',
      category: 'Trigger Accuracy',
      requirement: 'Refine trigger keywords and patterns across all 13 sub-agents to improve detection accuracy from 70-85% to >95%',
      business_value: 'Reduce false positives and missed activations',
      priority: 'HIGH',
      acceptance_criteria: '20 test scenarios show >95% true positive + true negative rate'
    },
    {
      id: 'FR-5',
      category: 'Result Quality',
      requirement: 'Update sub-agent personas with domain-specific context and validation logic to improve output quality from 75-90% to >90%',
      business_value: 'Better recommendations and actionable insights',
      priority: 'HIGH',
      acceptance_criteria: '10 test SDs evaluated with rubric show >90% average quality score'
    },
    {
      id: 'FR-6',
      category: 'Context Efficiency',
      requirement: 'Implement tiered compression system (TIER_1/2/3) to reduce token usage from 15K-30K to <10K per SD',
      business_value: 'Prevent context overflow, enable longer conversations',
      priority: 'MEDIUM',
      acceptance_criteria: '5 test SDs show <10K average token consumption with compression'
    }
  ],

  technical_requirements: [
    {
      phase: 'Discovery',
      duration: '2-3 hours',
      objectives: [
        'Parse 17 retrospective files for sub-agent performance patterns',
        'Extract mentions of trigger failures, result quality issues, context inefficiency',
        'Categorize findings by sub-agent code',
        'Calculate baseline metrics (trigger accuracy, result quality, token usage)',
        'Generate gap analysis report with actionable recommendations'
      ],
      deliverables: ['analyze-retrospectives.js script', 'Gap analysis JSON report', 'Baseline metrics table'],
      tasks: [
        'Create retrospective parsing script with keyword detection',
        'Implement pattern extraction (regex for sub-agent mentions)',
        'Calculate baseline percentages from retrospective data',
        'Generate structured JSON output with recommendations'
      ]
    },
    {
      phase: 'Design',
      duration: '3-4 hours',
      objectives: [
        'Create enhancement specifications for 13 sub-agents',
        'Design improved personas with domain-specific context',
        'Define new trigger keywords (20-30 additions)',
        'Specify validation logic improvements',
        'Design compression tier rules (TIER_1: critical/no compression, TIER_2: warnings/structured summary, TIER_3: pass/reference only)'
      ],
      deliverables: ['Enhancement specs JSON (13 files)', 'Trigger keyword mappings', 'Validation logic specs', 'Compression tier decision tree'],
      tasks: [
        'Document enhanced persona for each sub-agent',
        'Map new trigger keywords to sub-agent activations',
        'Define validation rules (e.g., TESTING makes verdicts blocking)',
        'Create compression tier classification logic'
      ]
    },
    {
      phase: 'Implementation',
      duration: '6.5 hours',
      objectives: [
        'UPDATE all 13 sub-agents in leo_sub_agents table (descriptions, metadata)',
        'INSERT 20-30 new triggers in leo_sub_agent_triggers table',
        'Enhance unified-handoff-system.js trigger detection logic',
        'Implement compression tiers in sub-agent-compressor.js',
        'Create rollback script with original values'
      ],
      deliverables: ['Database UPDATE scripts (13)', 'Enhanced unified-handoff-system.js', 'Enhanced sub-agent-compressor.js', 'Rollback script'],
      tasks: [
        'Write UPDATE queries for each sub-agent',
        'Test UPDATE queries in transaction before commit',
        'Add trigger keyword detection to unified-handoff-system.js',
        'Implement getCompressionTier() and compressSubAgentReport() functions',
        'Store original values for rollback'
      ]
    },
    {
      phase: 'Validation',
      duration: '2-3 hours',
      objectives: [
        'Execute comprehensive testing suite (unit, integration, E2E)',
        'Measure trigger accuracy improvements (baseline vs enhanced)',
        'Measure result quality improvements',
        'Measure token efficiency gains',
        'Verify all 6 business objectives met'
      ],
      deliverables: ['Unit test suite', 'Integration test suite', 'E2E test scripts', 'Performance measurement report'],
      tasks: [
        'Write unit tests for trigger detection',
        'Write integration tests for handoff workflows',
        'Execute E2E tests on test SDs',
        'Measure and compare baseline vs enhanced metrics',
        'Generate validation report with pass/fail verdicts'
      ]
    }
  ],

  acceptance_criteria: [
    { id: 'AC-1', criteria: 'Infrastructure Discovery Enhanced', status: 'pending', priority: 'CRITICAL' },
    { id: 'AC-2', criteria: 'Testing Enforcement Blocking', status: 'pending', priority: 'CRITICAL' },
    { id: 'AC-3', criteria: 'CI/CD Verification Trigger Added', status: 'pending', priority: 'CRITICAL' },
    { id: 'AC-4', criteria: 'All 13 Sub-Agents Enhanced', status: 'pending', priority: 'HIGH' },
    { id: 'AC-5', criteria: 'Trigger Accuracy >95%', status: 'pending', priority: 'HIGH' },
    { id: 'AC-6', criteria: 'Result Quality >90%', status: 'pending', priority: 'HIGH' },
    { id: 'AC-7', criteria: 'Token Usage <10K per SD', status: 'pending', priority: 'MEDIUM' },
    { id: 'AC-8', criteria: 'Compression Tiers Implemented', status: 'pending', priority: 'MEDIUM' },
    { id: 'AC-9', criteria: 'Zero Migrations Required', status: 'pending', priority: 'MEDIUM' },
    { id: 'AC-10', criteria: 'Rollback Script Tested', status: 'pending', priority: 'LOW' }
  ],

  test_scenarios: [
    { id: 'TS-1', scenario: 'Create test SD, verify VALIDATION sub-agent triggers on PLAN_PRD_CREATION', expected: 'Infrastructure audit report generated', type: 'Integration' },
    { id: 'TS-2', scenario: 'Attempt EXEC→PLAN handoff without tests', expected: 'Handoff creation BLOCKED', type: 'Integration' },
    { id: 'TS-3', scenario: 'Complete EXEC phase, verify DevOps checks CI/CD', expected: 'Pipeline status verified', type: 'Integration' },
    { id: 'TS-4', scenario: 'Run 20 test cases with enhanced triggers', expected: '>95% accuracy', type: 'Unit' },
    { id: 'TS-5', scenario: 'Execute sub-agents on 10 test SDs', expected: '>90% quality score', type: 'E2E' },
    { id: 'TS-6', scenario: 'Measure token usage on 5 test SDs', expected: '<10K average', type: 'Performance' },
    { id: 'TS-7', scenario: 'Generate reports with critical/warning/pass', expected: 'Correct TIER_1/2/3 compression', type: 'Unit' },
    { id: 'TS-8', scenario: 'Execute rollback script', expected: 'Database restored to original state', type: 'Integration' }
  ],

  performance_requirements: {
    baseline: { trigger_accuracy: '70-85%', result_quality: '75-90%', token_usage: '15K-30K per SD', false_positive_rate: 'Unknown', enforcement_rate: '~50%' },
    target: { trigger_accuracy: '>95%', result_quality: '>90%', token_usage: '<10K per SD', false_positive_rate: '0%', enforcement_rate: '100%' },
    measurement: {
      trigger_accuracy: 'True positives + true negatives / total test cases',
      result_quality: '10-point rubric across 10 test SDs',
      token_usage: 'Context consumption before/after compression',
      false_positives: 'Count irrelevant sub-agent triggers',
      enforcement: 'Verify BLOCKING verdicts prevent handoffs'
    }
  },

  risks: [
    { risk: 'Trigger enhancements cause false positives', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Iterative refinement, A/B testing' },
    { risk: 'Compression loses critical information', probability: 'LOW', impact: 'HIGH', mitigation: 'TIER_1 (critical) has zero compression' },
    { risk: 'Database UPDATE queries fail', probability: 'LOW', impact: 'HIGH', mitigation: 'Test in transaction, rollback script ready' },
    { risk: 'Enhanced sub-agents break workflows', probability: 'MEDIUM', impact: 'HIGH', mitigation: 'Comprehensive E2E testing, rollback available' }
  ],

  dependencies: [
    { name: 'leo_sub_agents table access', type: 'DATABASE', status: 'AVAILABLE', notes: 'Verified by Database Architect' },
    { name: '17 retrospective files', type: 'FILE', status: 'AVAILABLE', notes: 'Located in /retrospectives' },
    { name: 'unified-handoff-system.js', type: 'CODE', status: 'AVAILABLE', notes: 'Found in scripts/' },
    { name: 'sub-agent-compressor.js', type: 'CODE', status: 'AVAILABLE', notes: 'Found in lib/context/' }
  ],

  implementation_approach: `4-Phase Approach: (1) Discovery: Extract patterns from 17 retrospectives using automated parsing script, identify gaps by sub-agent, calculate baseline metrics; (2) Design: Create enhancement specs for 13 sub-agents, design improved personas, define new triggers (20-30), specify compression tiers (TIER_1/2/3); (3) Implementation: UPDATE database records (zero migrations), enhance trigger detection in unified-handoff-system.js, implement compression in sub-agent-compressor.js, create rollback script; (4) Validation: Execute unit/integration/E2E tests, measure improvements, verify all acceptance criteria met. Priority order: Infrastructure Discovery (TOP ROI), Testing Enforcement, CI/CD Verification, then remaining 10 sub-agents. Total duration: 14-16.5 hours over 4 days (4h/day sessions).`,

  plan_checklist: [
    { item: 'Query sd_backlog_map', status: 'completed' },
    { item: 'Create comprehensive PRD', status: 'in_progress' },
    { item: 'Generate 12-15 user stories', status: 'pending' },
    { item: 'Define testing strategy', status: 'pending' },
    { item: 'Execute sequential sub-agents', status: 'pending' },
    { item: 'Database migration validation', status: 'not_required' },
    { item: 'Create PLAN→EXEC handoff', status: 'pending' }
  ],

  exec_checklist: [
    { item: 'Application context validation', status: 'pending' },
    { item: 'Phase 1: Create retrospective analysis script', status: 'pending' },
    { item: 'Phase 2: Update sub-agent configurations', status: 'pending' },
    { item: 'Phase 3: Enhance trigger detection and compression', status: 'pending' },
    { item: 'Phase 4: Execute testing and measure improvements', status: 'pending' },
    { item: 'Create EXEC→PLAN handoff', status: 'pending' }
  ],

  validation_checklist: [
    { item: 'Wait for CI/CD pipelines', status: 'pending' },
    { item: 'Execute sub-agents (QA, DevOps, Database, Security)', status: 'pending' },
    { item: 'Aggregate results', status: 'pending' },
    { item: 'Generate PLAN verification verdict', status: 'pending' },
    { item: 'Create PLAN→LEAD handoff', status: 'pending' }
  ],

  progress: 0,
  phase: 'planning',

  created_by: 'PLAN Agent (Technical Planning Agent)',
  created_at: new Date().toISOString(),
  planned_start: new Date().toISOString(),
  planned_end: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString() // +4 days
};

async function createPRD() {
  console.log('📋 Creating PRD for SD-SUBAGENT-IMPROVE-001...\n');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!\n');
  console.log('   PRD ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Status:', data.status);
  console.log('   Version:', data.version);
  console.log('   Priority:', data.priority);
  console.log('   Category:', data.category);
  console.log('   Linked SD:', data.directive_id);
  console.log('');
  console.log('📊 PRD Structure:');
  console.log('   ✅ Executive Summary');
  console.log('   ✅ Business Context (objectives, ROI)');
  console.log('   ✅ Technical Context (architecture, approach)');
  console.log('   ✅ 6 Functional Requirements (FR-1 to FR-6)');
  console.log('   ✅ 4-Phase Technical Requirements (Discovery, Design, Implementation, Validation)');
  console.log('   ✅ 10 Acceptance Criteria (AC-1 to AC-10)');
  console.log('   ✅ 8 Test Scenarios (Unit, Integration, E2E, Performance)');
  console.log('   ✅ Performance Requirements (Baseline vs Target)');
  console.log('   ✅ 4 Risks with Mitigations');
  console.log('   ✅ 4 Dependencies (all available)');
  console.log('   ✅ Implementation Approach (4-phase, 14-16.5h)');
  console.log('   ✅ PLAN Checklist (7 items)');
  console.log('   ✅ EXEC Checklist (6 items)');
  console.log('   ✅ Validation Checklist (5 items)');
  console.log('');
  console.log('🚀 Ready for user story generation!');
}

createPRD().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
