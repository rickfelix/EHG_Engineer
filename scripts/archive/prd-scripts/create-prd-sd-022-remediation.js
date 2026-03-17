#!/usr/bin/env node

/**
 * Create PRD for SD-022-PROTOCOL-REMEDIATION-001
 * Database-first PRD creation with test_scenarios
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('═'.repeat(60));
  console.log('📄 CREATING PRD: SD-022-PROTOCOL-REMEDIATION-001');
  console.log('═'.repeat(60));

  const prd = {
    id: 'PRD-SD-022-PROTOCOL-REMEDIATION-001',
    sd_id: 'SD-022-PROTOCOL-REMEDIATION-001',
    title: 'LEO Protocol Compliance: SD-022 Retroactive Documentation',
    status: 'approved',
    priority: 'high',

    executive_summary: `Generate missing LEO Protocol v4.2.0 artifacts for SD-022 (Competitive Intelligence module) to achieve full database-first compliance.

**Scope**: Create 4 retroactive phase handoffs, generate comprehensive retrospective, create E2E test suite.

**Business Value**: Ensures historical SD adheres to current LEO Protocol v4.2.0 standards, enabling proper tracking, metrics, and process improvement.

**Completion Criteria**: All handoffs in database, retrospective quality ≥85%, E2E tests passing, zero markdown files.`,

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Create 4 retroactive phase handoffs in sd_phase_handoffs table',
        rationale: 'SD-022 implemented Sept 27, 2025 lacks handoffs (pre-v4.2.0)',
        priority: 'high',
        acceptance_criteria: [
          'LEAD→PLAN handoff with strategic approval context',
          'PLAN→EXEC handoff with PRD references',
          'EXEC→PLAN handoff with implementation summary',
          'PLAN→LEAD handoff with verification results'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Generate comprehensive retrospective for SD-022',
        rationale: 'Capture lessons learned from 2,265 LOC implementation',
        priority: 'medium',
        acceptance_criteria: [
          'Retrospective quality score ≥85/100',
          'All 6 retrospective sections populated',
          'Stored in sd_retrospectives table'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Create E2E test suite for competitive intelligence module',
        rationale: 'SD-022 lacks automated testing, required by LEO Protocol v4.2.0',
        priority: 'high',
        acceptance_criteria: [
          '100% user story coverage across 4 components',
          'Tests cover CompetitiveIntelligenceModule, CompetitiveLandscapeMapping, CompetitorAnalysisAutomation, UserCentricBenchmarking',
          'All tests passing in CI/CD pipeline'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Delete all markdown files violating database-first architecture',
        rationale: 'Achieve strict compliance with LEO Protocol v4.2.0 database-first principle',
        priority: 'high',
        acceptance_criteria: [
          'DOCMON sub-agent verification: 100% pass',
          'Zero .md files in docs/implementation-specs/ for SDs',
          'Zero .md files in scripts/ for handoffs/retrospectives'
        ]
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use unified-handoff-system.js for handoff creation',
        rationale: 'Ensures proper RLS bypass and validation',
        implementation_notes: 'Script uses service role key, bypasses RLS, validates 7-element handoff structure',
        dependencies: ['Supabase service role key', 'sd_phase_handoffs table schema']
      },
      {
        id: 'TR-2',
        requirement: 'Invoke DATABASE sub-agent for schema validation',
        rationale: 'Prevent constraint violations (status, handoff_type fields)',
        implementation_notes: 'DATABASE agent validates against sd_phase_handoffs_status_check, ensures handoff_type is uppercase',
        dependencies: ['DATABASE sub-agent', 'LEO Protocol sub-agent system']
      },
      {
        id: 'TR-3',
        requirement: 'Invoke TESTING sub-agent for E2E test generation',
        rationale: 'Automate test creation from user stories',
        implementation_notes: 'TESTING agent generates Playwright tests, 490 LOC expected',
        dependencies: ['TESTING sub-agent', 'User stories for SD-022', 'Playwright framework']
      },
      {
        id: 'TR-4',
        requirement: 'Invoke GITHUB sub-agent for CI/CD verification',
        rationale: 'Ensure tests pass in pipeline before marking SD complete',
        implementation_notes: 'GITHUB agent checks workflow status, monitors for failures',
        dependencies: ['GITHUB sub-agent', 'GitHub Actions workflows', '.github/workflows/']
      },
      {
        id: 'TR-5',
        requirement: 'Use conventional commit format with SD-ID prefix',
        rationale: 'Git commit best practices per LEO Protocol',
        implementation_notes: 'Format: feat(SD-022-PROTOCOL-REMEDIATION-001): <subject>',
        dependencies: ['Git repository', 'Conventional commits standard']
      }
    ],

    acceptance_criteria: [
      {
        id: 'AC-1',
        criterion: '4 handoffs exist in sd_phase_handoffs table for SD-022',
        validation_method: 'Database query: SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = \'SD-022\'',
        expected_result: 'COUNT = 4'
      },
      {
        id: 'AC-2',
        criterion: 'Retrospective exists with quality ≥85/100',
        validation_method: 'Database query: SELECT quality_score FROM sd_retrospectives WHERE sd_id = \'SD-022\'',
        expected_result: 'quality_score ≥ 85'
      },
      {
        id: 'AC-3',
        criterion: 'E2E tests exist and pass',
        validation_method: 'TESTING sub-agent verification + CI/CD pipeline status',
        expected_result: 'TESTING: PASS, GitHub Actions: success'
      },
      {
        id: 'AC-4',
        criterion: 'Zero markdown files violate database-first',
        validation_method: 'DOCMON sub-agent verification',
        expected_result: 'DOCMON: 100% pass, zero violations'
      },
      {
        id: 'AC-5',
        criterion: 'All sub-agents pass verification',
        validation_method: 'Run all 5 sub-agents (DOCMON, DATABASE, STORIES, TESTING, GITHUB)',
        expected_result: 'All agents: PASS or CONDITIONAL_PASS'
      }
    ],

    test_scenarios: [
      {
        scenario: 'Verify retroactive handoffs created successfully',
        given: 'SD-022 exists without handoffs in database',
        when: 'DATABASE sub-agent creates 4 handoffs using unified-handoff-system.js',
        then: 'All 4 handoffs exist with status=pending_acceptance, handoff_type set correctly',
        test_data: 'SD-022 as sd_id input'
      },
      {
        scenario: 'Verify retrospective generation',
        given: 'SD-022 implementation completed Sept 27, 2025',
        when: 'generate-comprehensive-retrospective.js runs for SD-022',
        then: 'Retrospective exists in sd_retrospectives with quality_score ≥85',
        test_data: 'SD-022 as sd_id, commit 783bc19'
      },
      {
        scenario: 'Verify E2E test coverage',
        given: '4 user stories exist for SD-022 competitive intelligence components',
        when: 'TESTING sub-agent generates tests',
        then: '28 tests created covering all 4 user stories, 490 LOC test suite',
        test_data: 'User story IDs: US-SD-022-001 through US-SD-022-004'
      },
      {
        scenario: 'Verify database-first compliance',
        given: '9 markdown files violate database-first architecture',
        when: 'Files deleted and DOCMON sub-agent runs verification',
        then: 'DOCMON reports 100% pass, zero violations found',
        test_data: 'Files: SD-MANAGER-REFACTOR-REPORT.md, RETROSPECTIVE-ANALYSIS-REPORT.md, etc.'
      },
      {
        scenario: 'Verify CI/CD pipeline status',
        given: 'E2E tests committed to repository',
        when: 'GITHUB sub-agent checks workflow status',
        then: 'All workflows passing, no failed runs in last 24 hours',
        test_data: 'GitHub Actions workflows: test.yml, playwright.yml'
      }
    ],

    assumptions: [
      'Supabase database accessible with service role key',
      'All 4 competitive intelligence components functional',
      'Git commit 783bc19 contains complete SD-022 implementation',
      'LEO Protocol v4.2.0 sub-agent system operational',
      'Playwright testing framework installed and configured'
    ],

    dependencies: [
      'Supabase database (sd_phase_handoffs, sd_retrospectives, product_requirements_v2 tables)',
      'unified-handoff-system.js script',
      'generate-comprehensive-retrospective.js script',
      'LEO Protocol sub-agents (DOCMON, DATABASE, STORIES, TESTING, GITHUB)',
      'GitHub Actions CI/CD pipeline',
      'Playwright E2E testing framework'
    ]
  };

  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prd)
      .select();

    if (error) {
      console.error('❌ Failed to create PRD:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }

    console.log('✅ PRD created successfully!');
    console.log('   ID:', data[0].id);
    console.log('   Title:', data[0].title);
    console.log('   Status:', data[0].status);
    console.log('   Functional Requirements:', prd.functional_requirements.length);
    console.log('   Technical Requirements:', prd.technical_requirements.length);
    console.log('   Acceptance Criteria:', prd.acceptance_criteria.length);
    console.log('   Test Scenarios:', prd.test_scenarios.length);

    console.log('\n═'.repeat(60));
    console.log('✅ PRD CREATION COMPLETE');
    console.log('═'.repeat(60));
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

createPRD().catch(console.error);
