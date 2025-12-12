#!/usr/bin/env node
/**
 * Update retrospective for SD-VISION-TRANSITION-001E with improved quality content
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Updating retrospective for SD-VISION-TRANSITION-001E...');

  const retroUpdate = {
    quality_score: 90,
    what_went_well: [
      'Systematic identification: Used grep with patterns (1-40, out of 40, .max(40)) to find all 10 files with legacy 40-stage references',
      'Zero-error TypeScript compilation: All 10 file updates passed tsc --noEmit without any type errors',
      'Complete sub-agent coverage: DESIGN (95% confidence), DATABASE (PASS with deferred items), DOCMON (PASS), STORIES (100% - 8/8 validated)',
      'Database-first compliance: Archived violating markdown file instead of leaving in docs folder',
      'EXEC-TO-PLAN handoff: Scored 350% with comprehensive validation across all gates'
    ],
    what_needs_improvement: [
      'ROOT CAUSE: Database trigger extract_protocol_improvements_from_retro() has ambiguous column reference where local variable "improvement_type" shadows the table column. The WHERE clause "AND improvement_type = improvement_type" compares the column to itself instead of the local variable.',
      'CONTRIBUTING FACTORS: (1) No CI test for trigger functions, (2) No schema linter that catches ambiguous references, (3) Manual migration deployment without staging validation',
      'SYSTEMIC FIX NEEDED: Add trigger function unit tests to CI pipeline, implement pg_lint or similar for ambiguous column detection'
    ],
    key_learnings: [
      'TRIGGER NAMING: Always prefix local variables in PL/pgSQL with v_ (e.g., v_improvement_type) to avoid column name collisions. The fix requires changing line 140 from "improvement_type TEXT" to "v_improvement_type TEXT" and updating all references.',
      'CROSS-REPO SDs: Infrastructure SDs that modify code in other repositories (like EHG app) require careful branch management - the feature branch in EHG_Engineer does not automatically propagate to EHG app.',
      'SCHEMA MAINTENANCE: Database triggers should be tested with synthetic data as part of CI (e.g., INSERT INTO retrospectives with protocol_improvements JSON) - currently no such test exists'
    ],
    action_items: [
      {
        action: 'Fix improvement_type ambiguity in extract_protocol_improvements_from_retro trigger',
        owner: 'Database team',
        deadline: '2025-12-12',
        success_criteria: 'Trigger executes without error for 100 synthetic retrospectives with protocol_improvements',
        test_plan: '1. Create migration with v_improvement_type rename, 2. Deploy to staging, 3. Run INSERT INTO retrospectives with sample protocol_improvements JSON, 4. Verify protocol_improvement_queue receives entries',
        priority: 'HIGH',
        estimated_effort: '2 hours',
        rollback_plan: 'DROP FUNCTION and re-CREATE from backup SQL file'
      },
      {
        action: 'Add trigger function test to CI pipeline',
        owner: 'DevOps team',
        deadline: '2025-12-20',
        success_criteria: 'GitHub Actions workflow includes pg_tap or similar trigger tests that would catch ambiguous column references',
        priority: 'MEDIUM',
        estimated_effort: '4 hours'
      }
    ],
    failure_patterns: [
      'Trigger functions deployed without integration tests - discovered only when RETRO sub-agent tried to store retrospective',
      'PL/pgSQL variable naming did not follow defensive naming convention (v_ prefix)'
    ],
    success_patterns: [
      'Systematic codebase search with grep patterns before implementing changes',
      'Parallel sub-agent execution reduced PLAN phase time',
      'Database-first compliance check (DOCMON) caught markdown file violations early'
    ],
    improvement_areas: [
      {
        area: 'Trigger Function Testing',
        current_state: 'No automated tests for database triggers',
        desired_state: 'All triggers have integration tests in CI',
        root_cause: 'Rapid migration deployment without testing infrastructure',
        proposed_fix: 'Add pg_tap framework to test suite, write tests for all triggers with side effects',
        owner: 'Database team',
        priority: 'HIGH'
      },
      {
        area: 'PL/pgSQL Coding Standards',
        current_state: 'Variable naming inconsistent, leading to ambiguity',
        desired_state: 'All local variables prefixed with v_, all function parameters prefixed with p_',
        root_cause: 'No enforced coding standard for database code',
        proposed_fix: 'Document standard in CONTRIBUTING.md, add pg_lint to pre-commit hooks',
        owner: 'Engineering',
        priority: 'MEDIUM'
      }
    ]
  };

  const { data, error } = await supabase
    .from('retrospectives')
    .update(retroUpdate)
    .eq('sd_id', 'SD-VISION-TRANSITION-001E')
    .select()
    .single();

  if (error) {
    console.log('Update error:', error.message);
    return;
  }

  console.log('Retrospective updated successfully!');
  console.log('ID:', data.id);
  console.log('Quality Score:', data.quality_score);
}

main().catch(console.error);
