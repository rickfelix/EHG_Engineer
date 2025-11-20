#!/usr/bin/env node

/**
 * Create comprehensive user stories for SD-LEO-PROTOCOL-V4-4-0
 * Based on 4 implementation phases from approved draft
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createUserStories() {
  console.log('📋 Creating user stories for SD-LEO-PROTOCOL-V4-4-0...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Define user stories based on the 4 phases from draft
  const userStories = [
    // PHASE 1: Database Migration
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-001',
      title: 'Add validation_mode column to sub_agent_execution_results',
      user_role: 'system architect',
      user_want: 'add a validation_mode column to support prospective vs retrospective validation modes',
      user_benefit: 'sub-agents can apply appropriate validation criteria based on when validation occurs',
      acceptance_criteria: [
        'validation_mode column added to sub_agent_execution_results table',
        'Column has CHECK constraint limiting values to (prospective, retrospective)',
        'Default value is "prospective" for backward compatibility',
        'Existing records default to prospective mode',
        'Migration script runs successfully without errors'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      story_points: 1,
      phase: 'Phase 1: Database Migration',
      dependencies: [],
      tags: ['database', 'schema', 'migration']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-002',
      title: 'Implement CONDITIONAL_PASS verdict type',
      description: 'As a sub-agent, I need to support CONDITIONAL_PASS verdicts with justification and conditions, so that I can provide pragmatic approval for retrospective validation while maintaining transparency.',
      acceptance_criteria: [
        'verdict enum updated to include CONDITIONAL_PASS',
        'justification TEXT column added (NOT NULL for CONDITIONAL_PASS)',
        'conditions JSONB column added (stores array of follow-up actions)',
        'Database constraint ensures justification >= 50 chars for CONDITIONAL_PASS',
        'Database constraint ensures conditions array not empty for CONDITIONAL_PASS',
        'Migration preserves existing verdict data'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 0.5,
      phase: 'Phase 1: Database Migration',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-001'],
      tags: ['database', 'schema', 'verdict']
    },

    // PHASE 2: Sub-Agent Updates
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-003',
      title: 'Update TESTING agent with adaptive validation logic',
      description: 'As a TESTING sub-agent, I need to apply different validation criteria based on validation_mode, so that I can strictly require --full-e2e flag prospectively but accept any passing E2E tests retrospectively.',
      acceptance_criteria: [
        'Prospective mode: BLOCKED if --full-e2e flag not used',
        'Retrospective mode: CONDITIONAL_PASS if E2E tests exist and pass',
        'Retrospective mode: CONDITIONAL_PASS if manual validation evidence provided',
        'Justification includes test counts and validation method',
        'Conditions array recommends adding --full-e2e flag if missing',
        'Audit trail logs validation mode used',
        'Mode detection based on SD status (active/in_progress = prospective, completed = retrospective)'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1,
      phase: 'Phase 2: Sub-Agent Updates',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-002'],
      tags: ['sub-agent', 'testing', 'adaptive-logic']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-004',
      title: 'Update DOCMON agent with adaptive validation logic',
      description: 'As a DOCMON sub-agent, I need to distinguish between pre-existing files and SD-created files, so that I can block on ANY markdown prospectively but ignore pre-existing files retrospectively.',
      acceptance_criteria: [
        'Prospective mode: BLOCKED if ANY markdown files found',
        'Retrospective mode: Only flag NEW files created by current SD',
        'Retrospective mode: Ignore pre-existing markdown files (check git log/timestamps)',
        'CONDITIONAL_PASS if only pre-existing files present',
        'Justification lists file counts (new vs pre-existing)',
        'Conditions array empty if no new files, else recommends cleanup',
        'File detection logic uses git status + timestamps'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1,
      phase: 'Phase 2: Sub-Agent Updates',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-002'],
      tags: ['sub-agent', 'docmon', 'adaptive-logic']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-005',
      title: 'Update GITHUB agent with adaptive validation logic',
      description: 'As a GITHUB sub-agent, I need to focus on PR merge status retrospectively rather than working directory state, so that I can ignore untracked files unrelated to the SD.',
      acceptance_criteria: [
        'Prospective mode: Require clean working directory (no untracked files)',
        'Retrospective mode: Ignore untracked files, focus on PR merge status',
        'Retrospective mode: CONDITIONAL_PASS if PR merged successfully',
        'Retrospective mode: Include untracked file count in justification (informational)',
        'Conditions array recommends cleanup if >10 untracked files',
        'Verification checks PR merge commit exists',
        'Working directory check skipped in retrospective mode'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1,
      phase: 'Phase 2: Sub-Agent Updates',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-002'],
      tags: ['sub-agent', 'github', 'adaptive-logic']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-006',
      title: 'Update DESIGN agent with adaptive validation logic',
      description: 'As a DESIGN sub-agent, I need to accept placeholder PRD data retrospectively if implementation is complete, so that I can validate functional delivery over administrative compliance.',
      acceptance_criteria: [
        'Prospective mode: Validate workflow completeness (all PRD sections filled)',
        'Retrospective mode: Check if implementation complete (PR merged, features delivered)',
        'Retrospective mode: CONDITIONAL_PASS if implementation verified functional',
        'Retrospective mode: Accept placeholder data with justification',
        'Justification includes implementation evidence (PR link, commit count)',
        'Conditions array recommends updating PRD post-delivery',
        'Implementation check uses PR metadata + commit history'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1,
      phase: 'Phase 2: Sub-Agent Updates',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-002'],
      tags: ['sub-agent', 'design', 'adaptive-logic']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-007',
      title: 'Update DATABASE and STORIES agents for consistency',
      description: 'As DATABASE/STORIES sub-agents (already passing), I need minor updates for consistency with new validation framework, so that all sub-agents follow the same adaptive logic pattern.',
      acceptance_criteria: [
        'Both agents implement mode detection logic (even if behavior unchanged)',
        'Both agents log validation_mode in execution results',
        'Both agents return verdict in new schema format',
        'Justification field populated (even for PASS verdicts)',
        'Conditions array included in response (empty for PASS)',
        'Audit trail consistent with other sub-agents',
        'No behavioral changes (already passing in both modes)'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'medium',
      estimated_effort_hours: 0.5,
      phase: 'Phase 2: Sub-Agent Updates',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-002'],
      tags: ['sub-agent', 'database', 'stories', 'consistency']
    },

    // PHASE 3: Progress Calculation Update
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-008',
      title: 'Update get_progress_breakdown() to accept CONDITIONAL_PASS',
      description: 'As a progress tracking system, I need to accept CONDITIONAL_PASS verdicts in retrospective mode, so that pragmatically completed SDs can reach 100% progress.',
      acceptance_criteria: [
        'Function updated to check validation_mode when evaluating verdicts',
        'CONDITIONAL_PASS treated as PASS in retrospective mode',
        'CONDITIONAL_PASS treated as BLOCKED in prospective mode',
        'sub_agents_verified calculation includes both PASS and CONDITIONAL_PASS (retrospective)',
        'SQL query optimized (single pass, no N+1 queries)',
        'Backward compatible (existing PASS verdicts still work)',
        'Progress correctly calculated for mixed PASS/CONDITIONAL_PASS results'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1,
      phase: 'Phase 3: Progress Calculation',
      dependencies: [
        'SD-LEO-PROTOCOL-V4-4-0:US-003',
        'SD-LEO-PROTOCOL-V4-4-0:US-004',
        'SD-LEO-PROTOCOL-V4-4-0:US-005',
        'SD-LEO-PROTOCOL-V4-4-0:US-006',
        'SD-LEO-PROTOCOL-V4-4-0:US-007'
      ],
      tags: ['database', 'function', 'progress']
    },

    // PHASE 4: Documentation & Testing
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-009',
      title: 'Document validation criteria for each mode',
      description: 'As a developer, I need clear documentation of when to use each validation mode, so that I can apply the correct mode for my use case.',
      acceptance_criteria: [
        'Documentation created in docs/reference/adaptive-validation.md',
        'Lists all 6 sub-agents with prospective vs retrospective criteria',
        'Includes decision tree for mode selection',
        'Provides examples of when each mode is appropriate',
        'Documents CONDITIONAL_PASS justification requirements (>50 chars)',
        'Documents conditions array requirements (follow-up actions)',
        'Includes audit trail requirements and review process',
        'Linked from main protocol documentation'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'medium',
      estimated_effort_hours: 1,
      phase: 'Phase 4: Documentation & Testing',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-008'],
      tags: ['documentation', 'reference']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-010',
      title: 'Create test cases for mode detection and adaptive logic',
      description: 'As a QA engineer, I need comprehensive test coverage for mode detection and adaptive validation, so that the system behaves correctly in all scenarios.',
      acceptance_criteria: [
        'Unit tests for mode detection (SD status → validation_mode)',
        'Unit tests for each sub-agent\'s adaptive logic (prospective + retrospective)',
        'Integration tests for progress calculation with CONDITIONAL_PASS',
        'Test cases for justification validation (>50 chars)',
        'Test cases for conditions array validation (not empty)',
        'Test backward compatibility (existing prospective-only flows)',
        'Test edge cases (mixed PASS/CONDITIONAL_PASS, all CONDITIONAL_PASS)',
        'All tests passing (unit + integration)'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1.5,
      phase: 'Phase 4: Documentation & Testing',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-008'],
      tags: ['testing', 'unit', 'integration']
    },
    {
      id: 'SD-LEO-PROTOCOL-V4-4-0:US-011',
      title: 'Validate backward compatibility with existing SDs',
      description: 'As a system operator, I need to ensure existing SDs are not affected by the new validation modes, so that we don\'t break completed work.',
      acceptance_criteria: [
        'Existing SDs with PASS verdicts still show 100% progress',
        'Existing SDs default to prospective mode (no validation_mode set)',
        'No regressions in existing SD completion workflows',
        'Database migration applies successfully to production data',
        'All existing triggers/functions still work correctly',
        'Rollback plan documented and tested',
        'Performance impact minimal (<5ms query overhead)'
      ],
      status: 'ready',
      implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

      priority: 'high',
      estimated_effort_hours: 1,
      phase: 'Phase 4: Documentation & Testing',
      dependencies: ['SD-LEO-PROTOCOL-V4-4-0:US-010'],
      tags: ['testing', 'compatibility', 'validation']
    }
  ];

  // Delete existing placeholder stories
  console.log('🗑️  Deleting placeholder user stories...');
  const { error: deleteError } = await supabase
    .from('user_stories')
    .delete()
    .like('id', 'SD-LEO-PROTOCOL-V4-4-0:US-%');

  if (deleteError) {
    console.log('⚠️  Error deleting placeholders:', deleteError.message);
  }

  // Insert comprehensive user stories
  console.log('\n📝 Inserting user stories...\n');
  let successCount = 0;

  for (const story of userStories) {
    const { data, error } = await supabase
      .from('user_stories')
      .insert({
        id: story.id,
        sd_id: 'SD-LEO-PROTOCOL-V4-4-0',
        title: story.title,
        description: story.description,
        acceptance_criteria: story.acceptance_criteria,
        status: story.status,
        implementation_context: JSON.stringify({ approach: "See user story details", technical_details: [], files_to_modify: [], dependencies: [] }),

        priority: story.priority,
        estimated_effort_hours: story.estimated_effort_hours,
        metadata: {
          phase: story.phase,
          dependencies: story.dependencies,
          tags: story.tags
        },
        created_by: 'PLAN'
      })
      .select()
      .single();

    if (error) {
      console.log(`❌ ${story.id}: ${error.message}`);
    } else {
      console.log(`✅ ${story.id}: ${story.title}`);
      successCount++;
    }
  }

  console.log(`\n📊 Summary: ${successCount}/${userStories.length} user stories created`);

  // Summary by phase
  console.log('\n📋 User Stories by Phase:');
  console.log('Phase 1 (Database Migration): 2 stories');
  console.log('Phase 2 (Sub-Agent Updates): 5 stories');
  console.log('Phase 3 (Progress Calculation): 1 story');
  console.log('Phase 4 (Documentation & Testing): 3 stories');
  console.log('\nTotal Estimated Effort: 10 hours');

  console.log('\n✅ User story generation complete');
}

createUserStories();
