#!/usr/bin/env node
/**
 * Add User Stories for SD-LEO-COMPLETION-GATES-001
 * User Story Enforcement and Progress Calculation
 *
 * Creates user stories for implementing completion gates that enforce
 * user story requirements based on SD type profiles.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-LEO-COMPLETION-GATES-001';
const PRD_ID = 'PRD-SD-LEO-COMPLETION-GATES-001';

const userStories = [
  {
    story_key: `${SD_ID}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Fix Progress Calculation for User Story Validation',
    user_role: 'LEO Protocol User',
    user_want: 'The progress calculation to correctly validate user stories based on SD type profile',
    user_benefit: 'SDs cannot be marked complete without fulfilling story requirements, ensuring quality gates',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN Feature SD with 0 user stories WHEN calculate_sd_progress() runs THEN progress < 100% AND completion blocked',
      'GIVEN Infrastructure SD with 0 user stories WHEN calculate_sd_progress() runs THEN progress = 100% allowed (type does not require stories)',
      'GIVEN Feature SD with 3 user stories (2 validated) WHEN calculate_sd_progress() runs THEN progress = 66% AND blocked until all validated',
      'GIVEN Security SD with 1 user story (not validated) WHEN calculate_sd_progress() runs THEN progress < 100% AND completion blocked'
    ],
    definition_of_done: [
      'calculate_sd_progress() function updated in database',
      'Function queries sd_type_profiles for requires_user_stories flag',
      'Progress calculation blocks completion when required stories missing',
      'Unit tests passing for all SD types',
      'Database migration deployed to production',
      'Regression test confirms Infrastructure SDs unaffected'
    ],
    technical_notes: 'Function should query sd_type_profiles JOIN strategic_directives_v2 to check if current SD type requires user stories. If requires_user_stories=true and story count=0, return progress <100%. Consider caching type profile data for performance.',
    implementation_approach: 'Modify database/functions/calculate_sd_progress.sql to add JOIN with sd_type_profiles table. Add conditional logic: IF type_profile.requires_user_stories = true AND story_count = 0 THEN RETURN 0. Add weighted calculation for partial story completion.',
    implementation_context: 'Core governance function that gates SD completion. Currently allows Feature SDs to complete without stories (SD-LEO-COMPLETION-GATES-001 discovery). Must preserve backward compatibility for SDs already in EXEC phase.',
    architecture_references: [
      'database/functions/calculate_sd_progress.sql - Function to modify',
      'database/schema/sd_type_profiles.sql - Type requirements source',
      'docs/reference/schema/engineer/tables/strategic_directives_v2.md - SD structure'
    ],
    testing_scenarios: [
      { scenario: 'Feature SD without stories returns progress < 100%', type: 'unit', priority: 'P0' },
      { scenario: 'Infrastructure SD without stories returns progress = 100%', type: 'unit', priority: 'P0' },
      { scenario: 'Feature SD with partial story completion calculates weighted progress', type: 'unit', priority: 'P1' },
      { scenario: 'Performance test: calculate_sd_progress() completes in <100ms', type: 'performance', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/database/US-001-progress-calculation.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'DATABASE_AGENT'
  },

  {
    story_key: `${SD_ID}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add User Story Existence Gate to PLAN-TO-LEAD',
    user_role: 'LEO Protocol User',
    user_want: 'The PLAN-TO-LEAD handoff to block when required user stories are missing',
    user_benefit: 'SDs cannot complete PLAN phase without proper story coverage, enforcing planning discipline',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN Feature SD with 0 stories WHEN PLAN-TO-LEAD handoff attempted THEN handoff rejected with error "Feature SDs require user stories"',
      'GIVEN Feature SD with 3 stories WHEN PLAN-TO-LEAD handoff attempted THEN handoff proceeds normally',
      'GIVEN Infrastructure SD with 0 stories WHEN PLAN-TO-LEAD handoff attempted THEN handoff proceeds (type does not require stories)',
      'GIVEN rejected handoff WHEN error displayed THEN message includes remediation steps "Create user stories using scripts/add-user-stories-*.js"'
    ],
    definition_of_done: [
      'src/lib/executors/PlanToLeadExecutor.ts updated with story validation',
      'Integration tests passing for all SD types',
      'Error message provides clear remediation guidance',
      'Handoff audit log captures rejection reason',
      'Documentation updated in docs/reference/handoff-gates.md'
    ],
    technical_notes: 'Add pre-execution validation in PlanToLeadExecutor before calling handoff API. Query user_stories table COUNT by sd_id. If count=0 AND sd_type_profile.requires_user_stories=true, throw ValidationError with remediation steps.',
    implementation_approach: 'Add validateUserStories() method to PlanToLeadExecutor. Query database for story count and type requirements. Return validation result object with { valid: boolean, errorMessage?: string, remediation?: string[] }. Call validation before execute() proceeds.',
    implementation_context: 'Part of phase gate enforcement system. PLAN-TO-LEAD is critical gate where planning completeness is verified. Must integrate with existing handoff validation framework (see handoff.js).',
    architecture_references: [
      'src/lib/executors/PlanToLeadExecutor.ts - Executor to modify',
      'scripts/handoff.js - Handoff orchestration system',
      'database/schema/sd_type_profiles.sql - Type requirements'
    ],
    testing_scenarios: [
      { scenario: 'Feature SD without stories blocks PLAN-TO-LEAD handoff', type: 'integration', priority: 'P0' },
      { scenario: 'Feature SD with stories allows PLAN-TO-LEAD handoff', type: 'integration', priority: 'P0' },
      { scenario: 'Error message includes remediation steps', type: 'integration', priority: 'P1' },
      { scenario: 'Infrastructure SD bypasses story requirement', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/handoff/US-002-plan-to-lead-gate.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'DATABASE_AGENT'
  },

  {
    story_key: `${SD_ID}:US-003`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement SD Type Change Risk Assessment',
    user_role: 'Governance Administrator',
    user_want: 'SD type changes to be evaluated for risk level based on transition rules',
    user_benefit: 'High-risk changes require proper approval and critical changes are blocked, preventing governance bypass',
    priority: 'high',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN type change from "feature" to "infrastructure" WHEN assess_sd_type_change_risk() runs THEN risk="HIGH" AND requires_chairman_approval=true',
      'GIVEN type change from "security" to any type WHEN assess_sd_type_change_risk() runs THEN risk="CRITICAL" AND change_blocked=true',
      'GIVEN type change from "infrastructure" to "feature" WHEN assess_sd_type_change_risk() runs THEN risk="LOW" AND allowed_with_explanation=true',
      'GIVEN risk assessment result WHEN stored THEN governance_metadata.type_change_risk includes { from, to, risk, reason, approver }',
      'GIVEN CRITICAL risk level WHEN SD update attempted THEN trigger blocks change with error "Security SDs cannot change type"'
    ],
    definition_of_done: [
      'database/functions/assess_sd_type_change_risk.sql created',
      'Function implements transition matrix from FR-003',
      'Risk levels: LOW, MEDIUM, HIGH, CRITICAL correctly assigned',
      'Database trigger calls assessment before UPDATE',
      'Governance metadata updated with assessment results',
      'Unit tests for all transition combinations (16 tests)',
      'Integration test verifies trigger enforcement',
      'Migration script deployed'
    ],
    technical_notes: 'Create transition matrix lookup table or use CASE statement with all type combinations. Risk factors: story requirements change, deliverable type change, security implications, phase progression impact. Store assessment in governance_metadata JSONB column.',
    implementation_approach: 'Create assess_sd_type_change_risk(old_type, new_type, sd_phase, has_deliverables, has_stories) function. Implement matrix logic: security→any=CRITICAL, feature→infrastructure=HIGH, infrastructure→feature=LOW. Add trigger on strategic_directives_v2 BEFORE UPDATE that calls assessment and blocks if CRITICAL.',
    implementation_context: 'Part of SD type governance system (FR-003). Prevents abuse of type changes to bypass completion gates. Must work with existing governance_metadata structure. Consider impact on 74+ existing SDs.',
    architecture_references: [
      'database/functions/assess_sd_type_change_risk.sql - Function to create',
      'database/triggers/sd_type_change_governance.sql - Trigger to create',
      'docs/reference/schema/engineer/tables/strategic_directives_v2.md - Governance metadata structure'
    ],
    testing_scenarios: [
      { scenario: 'Security→any type change blocked as CRITICAL', type: 'unit', priority: 'P0' },
      { scenario: 'Feature→infrastructure assessed as HIGH risk', type: 'unit', priority: 'P0' },
      { scenario: 'Infrastructure→feature assessed as LOW risk', type: 'unit', priority: 'P1' },
      { scenario: 'Risk assessment stored in governance_metadata', type: 'integration', priority: 'P0' },
      { scenario: 'Trigger blocks CRITICAL changes with clear error', type: 'integration', priority: 'P0' }
    ],
    e2e_test_path: 'tests/integration/database/US-003-type-change-risk.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'DATABASE_AGENT'
  },

  {
    story_key: `${SD_ID}:US-004`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Orphan Protection for Completed Work',
    user_role: 'LEO Protocol User',
    user_want: 'Type changes to be blocked when they would orphan completed deliverables or validated user stories',
    user_benefit: 'Completed work is not invalidated by type changes, preserving investment and audit trail',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN SD with 2 completed deliverables WHEN type change would make deliverables invalid THEN change blocked with error "Would orphan 2 completed deliverables: [list]"',
      'GIVEN SD with 3 validated user stories WHEN type change would make stories invalid THEN change blocked with error "Would orphan 3 validated stories: [list]"',
      'GIVEN SD with no completed work WHEN type change attempted THEN orphan check passes and change proceeds (if risk allows)',
      'GIVEN blocked change WHEN error displayed THEN message includes remediation "Complete type change before deliverables or remove deliverables first"'
    ],
    definition_of_done: [
      'database/triggers/prevent_orphan_deliverables.sql created',
      'Trigger checks for completed deliverables on type change',
      'Trigger checks for validated user stories on type change',
      'Clear error message with list of orphaned items',
      'Error message includes remediation guidance',
      'Unit tests for orphan detection logic',
      'Integration tests verify trigger enforcement',
      'Migration script deployed'
    ],
    technical_notes: 'Trigger on strategic_directives_v2 BEFORE UPDATE checks OLD.sd_type vs NEW.sd_type. If changed, query deliverables table for completed items and user_stories for validation_status=validated. If found, RAISE EXCEPTION with list. Consider performance impact on large SDs.',
    implementation_approach: 'Create BEFORE UPDATE trigger that fires when sd_type changes. Query: SELECT COUNT(*) FROM deliverables WHERE sd_id=NEW.id AND status=completed. Query: SELECT COUNT(*) FROM user_stories WHERE sd_id=NEW.id AND validation_status=validated. If either >0, build error message with item titles and RAISE EXCEPTION.',
    implementation_context: 'Part of orphan protection system (FR-006). Prevents completed work from becoming invalid. Must integrate with type change risk assessment (US-003). Consider edge case: type upgrades (feature→security) should allow orphans.',
    architecture_references: [
      'database/triggers/prevent_orphan_deliverables.sql - Trigger to create',
      'database/schema/deliverables.sql - Deliverables table structure',
      'database/schema/user_stories.sql - User stories table structure'
    ],
    testing_scenarios: [
      { scenario: 'Type change with completed deliverables blocked', type: 'integration', priority: 'P0' },
      { scenario: 'Type change with validated stories blocked', type: 'integration', priority: 'P0' },
      { scenario: 'Type change with no completed work proceeds', type: 'integration', priority: 'P1' },
      { scenario: 'Error message lists orphaned items', type: 'integration', priority: 'P1' },
      { scenario: 'Type upgrade (feature→security) allows orphans', type: 'integration', priority: 'P2' }
    ],
    e2e_test_path: 'tests/integration/database/US-004-orphan-protection.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'DATABASE_AGENT'
  },

  {
    story_key: `${SD_ID}:US-005`,
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Add Phase-Based Timing Restrictions',
    user_role: 'Governance Administrator',
    user_want: 'Type changes to be restricted based on SD phase and completion timing',
    user_benefit: 'Type changes cannot be used to bypass validation after work has started, enforcing governance integrity',
    priority: 'medium',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      'GIVEN SD in EXEC phase WHEN type change attempted (except upgrades) THEN change blocked with error "Cannot change type during EXEC phase"',
      'GIVEN SD completed <24 hours ago WHEN type change attempted THEN change blocked with error "Cannot change type within 24h of completion"',
      'GIVEN SD in LEAD phase WHEN type change attempted THEN timing check passes (early enough to change)',
      'GIVEN type upgrade (feature→security) in EXEC WHEN attempted THEN timing restriction bypassed (upgrades allowed anytime)'
    ],
    definition_of_done: [
      'database/triggers/sd_type_timing_restrictions.sql created',
      'Phase check prevents changes during EXEC (except upgrades)',
      '24-hour window check prevents post-completion changes',
      'Upgrade exception implemented (security, compliance upgrades allowed)',
      'Clear error messages for timing violations',
      'Unit tests for phase restrictions',
      'Integration tests verify timing enforcement',
      'Migration script deployed'
    ],
    technical_notes: 'Add to existing type change trigger. Check NEW.current_phase: if EXEC and type change is not upgrade, block. Check completed_at timestamp: if NOT NULL and NOW() - completed_at < interval \'24 hours\', block. Define upgrades: feature→security, feature→compliance.',
    implementation_approach: 'Extend sd_type_change_governance trigger with phase and timing checks. Add is_type_upgrade(old_type, new_type) helper function. If not upgrade: check phase (block if EXEC) and check completed_at (block if <24h). Build context-aware error messages.',
    implementation_context: 'Part of type change governance (FR-005). Prevents late-stage type manipulation. Must work with risk assessment (US-003) and orphan protection (US-004). Consider user experience: provide clear windows when type changes are allowed.',
    architecture_references: [
      'database/triggers/sd_type_timing_restrictions.sql - Trigger to create',
      'database/functions/is_type_upgrade.sql - Helper function',
      'docs/reference/phase-progression.md - Phase transition rules'
    ],
    testing_scenarios: [
      { scenario: 'Type change during EXEC phase blocked', type: 'integration', priority: 'P0' },
      { scenario: 'Type change within 24h of completion blocked', type: 'integration', priority: 'P0' },
      { scenario: 'Type change during LEAD phase allowed', type: 'integration', priority: 'P1' },
      { scenario: 'Type upgrade during EXEC allowed', type: 'integration', priority: 'P1' }
    ],
    e2e_test_path: 'tests/integration/database/US-005-timing-restrictions.spec.ts',
    e2e_test_status: 'not_created',
    created_by: 'DATABASE_AGENT'
  }
];

async function addUserStories() {
  console.log(`📋 Adding ${userStories.length} User Stories to ${SD_ID}...\n`);

  for (const story of userStories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(story)
      .select();

    if (error) {
      console.log(`❌ Error creating ${story.story_key}:`, error.message);
      process.exit(1);
    }

    console.log(`✅ ${story.story_key}: ${story.title} (${story.story_points} pts)`);
  }

  // Verify count
  const { count, error: countError } = await supabase
    .from('user_stories')
    .select('*', { count: 'exact', head: true })
    .eq('sd_id', SD_ID);

  if (countError) {
    console.log('❌ Error verifying story count:', countError.message);
    process.exit(1);
  }

  console.log('\n✅ User stories created successfully');
  console.log(`   SD: ${SD_ID}`);
  console.log(`   PRD: ${PRD_ID}`);
  console.log(`   Stories Created: ${userStories.length}`);
  console.log(`   Verified Count: ${count}`);
  console.log(`   Total Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
  console.log('\nPriority Breakdown:');
  const priorityCounts = userStories.reduce((acc, s) => {
    acc[s.priority] = (acc[s.priority] || 0) + 1;
    return acc;
  }, {});
  Object.entries(priorityCounts).forEach(([priority, count]) => {
    console.log(`   ${priority}: ${count}`);
  });
}

addUserStories();
