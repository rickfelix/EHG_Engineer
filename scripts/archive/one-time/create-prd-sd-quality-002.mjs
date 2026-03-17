#!/usr/bin/env node

/**
 * Create PRD for SD-QUALITY-002: Test Coverage Policy by LOC Threshold
 *
 * PLAN Phase: Technical Planning
 * Created: 2025-10-04
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdId = `PRD-${crypto.randomUUID()}`;
const timestamp = new Date().toISOString();

const prd = {
  id: prdId,
  directive_id: 'SD-QUALITY-002',
  title: 'Test Coverage Policy by LOC Threshold - Implementation PRD',
  version: '1.0.0',
  status: 'planning',
  phase: 'PLAN',
  category: 'quality_assurance',
  priority: 'medium',

  executive_summary: 'Create database-driven test coverage policy with 3 LOC-based tiers (optional <20, recommended 20-50, required >50) to eliminate ambiguity in QA decisions.',

  functional_requirements: [
    {
      requirement: 'Create test_coverage_policies database table',
      description: 'PostgreSQL table storing LOC-based test coverage requirements with 3 tiers',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'Table test_coverage_policies exists in database',
        'Columns: id, tier_name, loc_min, loc_max, requirement_level, description, rationale',
        'Tier 1: 0-19 LOC = OPTIONAL',
        'Tier 2: 20-50 LOC = RECOMMENDED',
        'Tier 3: 51+ LOC = REQUIRED'
      ]
    },
    {
      requirement: 'QA Sub-Agent Policy Integration',
      description: 'Query policy table before making conditional approval decisions',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'QA sub-agent calculates function LOC',
        'Query policy table with LOC value',
        'Include policy tier in approval message',
        'Reference specific LOC threshold in rationale'
      ]
    },
    {
      requirement: 'CLAUDE.md Documentation Update',
      description: 'Document policy in primary developer reference',
      priority: 'MUST_HAVE',
      acceptance_criteria: [
        'New section: Test Coverage Policy',
        'Table showing all 3 tiers with examples',
        'Rationale documented',
        'QA sub-agent reference updated'
      ]
    }
  ],

  acceptance_criteria: [
    'test_coverage_policies table exists with 3 rows',
    'QA sub-agent queries policy and includes tier in message',
    'CLAUDE.md documents all 3 tiers',
    'Sample test: 17 LOC function returns OPTIONAL tier',
    'Sample test: 35 LOC function returns RECOMMENDED tier',
    'Sample test: 60 LOC function returns REQUIRED tier'
  ],

  data_model: {
    tables: [
      {
        name: 'test_coverage_policies',
        description: 'Stores LOC-based test coverage policy tiers',
        columns: [
          { name: 'id', type: 'UUID', primary_key: true },
          { name: 'tier_name', type: 'VARCHAR(50)', not_null: true },
          { name: 'loc_min', type: 'INTEGER', not_null: true },
          { name: 'loc_max', type: 'INTEGER', not_null: true },
          { name: 'requirement_level', type: 'VARCHAR(20)', not_null: true },
          { name: 'description', type: 'TEXT', not_null: true },
          { name: 'rationale', type: 'TEXT' },
          { name: 'created_at', type: 'TIMESTAMPTZ', default: 'NOW()' }
        ],
        indexes: [
          { name: 'idx_loc_range', columns: ['loc_min', 'loc_max'] }
        ],
        initial_data: [
          {
            tier_name: 'Tier 1: Simple Functions',
            loc_min: 0,
            loc_max: 19,
            requirement_level: 'OPTIONAL',
            description: 'Simple functions (getters, setters, helpers)',
            rationale: 'Low complexity = low bug risk. Tests welcome but not required.'
          },
          {
            tier_name: 'Tier 2: Moderate Functions',
            loc_min: 20,
            loc_max: 50,
            requirement_level: 'RECOMMENDED',
            description: 'Moderate complexity (business logic, API calls)',
            rationale: 'Tests recommended. Conditional approval with justification.'
          },
          {
            tier_name: 'Tier 3: Complex Functions',
            loc_min: 51,
            loc_max: 99999,
            requirement_level: 'REQUIRED',
            description: 'Complex functions (algorithms, state management)',
            rationale: 'High complexity requires unit tests for correctness.'
          }
        ]
      }
    ]
  },

  exec_checklist: [
    { item: 'Create database migration: add-test-coverage-policies.sql', status: 'pending', checked: false },
    { item: 'Execute migration via scripts/execute-database-sql.js', status: 'pending', checked: false },
    { item: 'Verify table exists with correct schema', status: 'pending', checked: false },
    { item: 'Insert 3 policy tier rows', status: 'pending', checked: false },
    { item: 'Update QA sub-agent with LOC counting logic', status: 'pending', checked: false },
    { item: 'Add policy query to QA sub-agent', status: 'pending', checked: false },
    { item: 'Update approval message format', status: 'pending', checked: false },
    { item: 'Update CLAUDE.md with policy documentation', status: 'pending', checked: false },
    { item: 'Test QA sub-agent with sample functions (10 LOC, 30 LOC, 60 LOC)', status: 'pending', checked: false },
    { item: 'Verify policy lookup works correctly', status: 'pending', checked: false }
  ],

  test_scenarios: [
    {
      scenario: 'Verify database table creation',
      steps: ['Execute migration', 'Query information_schema.tables', 'Verify all columns exist'],
      expected: 'Table test_coverage_policies exists with correct schema'
    },
    {
      scenario: 'Verify 3 policy tiers inserted',
      steps: ['SELECT * FROM test_coverage_policies ORDER BY loc_min'],
      expected: '3 rows returned with correct LOC ranges'
    },
    {
      scenario: 'QA sub-agent queries policy for 17 LOC function',
      steps: ['Create sample PRD with 17 LOC function', 'Run QA sub-agent'],
      expected: 'Returns Tier 1: OPTIONAL'
    },
    {
      scenario: 'QA sub-agent queries policy for 35 LOC function',
      steps: ['Create sample PRD with 35 LOC function', 'Run QA sub-agent'],
      expected: 'Returns Tier 2: RECOMMENDED'
    },
    {
      scenario: 'QA sub-agent queries policy for 75 LOC function',
      steps: ['Create sample PRD with 75 LOC function', 'Run QA sub-agent'],
      expected: 'Returns Tier 3: REQUIRED'
    }
  ],

  risks: [
    {
      risk: 'LOC counting inconsistency (comments, blank lines)',
      mitigation: 'Use standard LOC counter library (e.g., cloc, tokei)',
      severity: 'LOW'
    },
    {
      risk: 'Policy too lenient or too strict',
      mitigation: 'Start with documented tiers, adjust based on team feedback after 2 weeks',
      severity: 'LOW'
    },
    {
      risk: 'Developers ignore policy',
      mitigation: 'Enforce via QA sub-agent automation, document in CLAUDE.md',
      severity: 'LOW'
    }
  ],

  dependencies: [
    'Database migration infrastructure (exists)',
    'QA sub-agent script location (need to find)',
    'CLAUDE.md write access',
    'Supabase database connection'
  ],

  created_at: timestamp,
  updated_at: timestamp,
  created_by: 'PLAN Agent',
  metadata: {
    source_sd: 'SD-QUALITY-002',
    estimated_effort_hours: 1,
    complexity: 'LOW',
    database_changes: true,
    code_changes: true,
    documentation_changes: true,
    exec_deliverables: [
      'database/migrations/add-test-coverage-policies.sql',
      'Updated QA sub-agent script',
      'Updated CLAUDE.md',
      'Test verification results'
    ]
  }
};

console.log('📝 Creating PRD for SD-QUALITY-002...\n');

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prd)
  .select();

if (error) {
  console.error('❌ Error creating PRD:', error);
  process.exit(1);
}

console.log('✅ PRD Created Successfully');
console.log('   ID:', data[0].id);
console.log('   Title:', data[0].title);
console.log('   Status:', data[0].status);
console.log('   Phase:', data[0].phase);
console.log('   Functional Requirements:', data[0].functional_requirements.length);
console.log('   Acceptance Criteria:', data[0].acceptance_criteria.length);
console.log('   EXEC Checklist:', data[0].exec_checklist.length, 'items');
console.log('   Test Scenarios:', data[0].test_scenarios.length);
console.log('');
console.log('🎯 NEXT STEP: Invoke Database Architect Sub-Agent');
console.log('   Verify schema design for test_coverage_policies table');
console.log('');
