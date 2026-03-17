#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-HARDENING-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-HARDENING-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Protocol Enforcement Hardening - Autonomous Checkpoints and Sub-Agent Recording'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  // Query by sd_key OR id to handle both formats (sd_key like SD-XXX-001, id is UUID)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority')
    .or(`sd_key.eq.${SD_ID},id.eq.${SD_ID}`)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  // Use UUID for FK references
  const sdUuid = sdData.id;

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   SD Key: ${sdData.sd_key}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${sdData.sd_key || SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id (UUID)
    id: prdId,
    sd_id: sdUuid,                  // FK to strategic_directives_v2.id (UUID)
    directive_id: sdUuid,           // Backward compatibility (UUID)

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'Infrastructure',
    priority: 'medium', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
This PRD addresses three protocol enforcement gaps identified during codebase audit:

1. **Autonomous Mode Drift**: When Claude executes autonomously for extended periods, work can drift from original intent without human checkpoints. This introduces a mandatory checkpoint system that pauses after N turns for review.

2. **EXEC-TO-PLAN Enforcement for Large Changes**: Infrastructure and refactor SDs with >500 LOC changes can currently bypass EXEC-TO-PLAN verification. This adds a LOC threshold gate that blocks completion without proper handoff.

3. **Sub-Agent Task Recording**: Task tool calls are not consistently recorded in the database, causing gaps in the stop-hook enforcement system. This wraps Task invocations with database recording hooks.

These changes strengthen LEO Protocol governance by closing enforcement gaps that allowed large changes to bypass verification and sub-agent invocations to go untracked.
    `.trim(),

    business_context: `
**Pain Points:**
- Autonomous execution sessions can drift from original SD intent without human review
- Large infrastructure changes (500+ LOC) bypass verification gates
- Sub-agent enforcement (stop-hook) has incomplete visibility into Task invocations

**Business Objectives:**
- Maintain protocol governance integrity during autonomous execution
- Ensure large changes receive proper verification
- Complete sub-agent audit trail for enforcement decisions

**Success Metrics:**
- Checkpoint fires after configurable turn threshold (default: 20)
- 100% of large infrastructure SDs require EXEC-TO-PLAN
- 100% of Task invocations recorded in subagent_activations table
    `.trim(),

    technical_context: `
**Existing Systems:**
- Handoff system: scripts/handoff.js, scripts/modules/handoff/
- Sub-agent enforcement: scripts/hooks/stop-subagent-enforcement.js
- Task tool: Claude Code built-in tool with subagent_type parameter

**Architecture Patterns:**
- Gate-based validation in handoff executors
- Database-first recording with subagent_activations table
- Stop hook enforcement at session end

**Integration Points:**
- EXEC-TO-PLAN executor gates (mandatory-testing-validation.js pattern)
- Claude Code hooks system (.claude/settings.json)
- Task tool wrapper (new middleware layer)
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Autonomous Mode Checkpoint Enforcement',
        description: 'Add mandatory checkpoint enforcement that pauses autonomous execution after a configurable number of turns (default: 20). Checkpoint forces human review before continuing.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Checkpoint triggers after turn count exceeds threshold',
          'Threshold is configurable via environment variable or settings',
          'Checkpoint displays summary of work done since last checkpoint',
          'Human can approve continuation or redirect work'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'EXEC-TO-PLAN LOC Threshold Gate',
        description: 'Add LOC threshold gate to EXEC-TO-PLAN handoff that blocks completion for infrastructure/refactor SDs with >500 lines changed without proper handoff verification.',
        priority: 'HIGH',
        acceptance_criteria: [
          'Gate calculates LOC from git diff --stat',
          'Gate applies to sd_type in [infrastructure, refactor]',
          'LOC threshold is 500 lines (configurable)',
          'Gate blocks handoff with clear error message if threshold exceeded',
          'Gate logs enforcement decision to database'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Sub-Agent Task Recording Hooks',
        description: 'Wrap Task tool invocations with database recording hooks to ensure all sub-agent calls are tracked in subagent_activations table for stop-hook enforcement visibility.',
        priority: 'HIGH',
        acceptance_criteria: [
          'All Task tool calls with subagent_type are recorded',
          'Recording includes: sd_id, agent_type, phase, timestamp, context',
          'Recording happens before and after Task execution',
          'Failed Task calls are also recorded with error status',
          'Stop-hook can query complete sub-agent history'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'Minimal overhead for Task recording',
        target_metric: '<50ms added latency per Task call'
      },
      {
        type: 'reliability',
        requirement: 'Recording failures must not block Task execution',
        target_metric: 'Task proceeds even if recording fails; failure logged'
      },
      {
        type: 'configurability',
        requirement: 'Thresholds configurable without code changes',
        target_metric: 'All thresholds via env vars or database settings'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Use existing subagent_activations table',
        description: 'Recording hooks insert into existing table schema; no schema changes',
        dependencies: ['subagent_activations table', 'Supabase client']
      },
      {
        id: 'TR-2',
        requirement: 'Follow existing gate pattern',
        description: 'LOC threshold gate follows createXxxGate() pattern from exec-to-plan/gates/',
        dependencies: ['BaseExecutor', 'gate registration pattern']
      },
      {
        id: 'TR-3',
        requirement: 'Hook-based checkpoint (no core changes)',
        description: 'Checkpoint implemented as Claude Code hook, not core code modification',
        dependencies: ['.claude/settings.json', 'hooks directory']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview

Three independent enforcement mechanisms:

1. **Autonomous Checkpoint Hook** (hooks/autonomous-checkpoint.js)
   - Monitors turn count during execution
   - Triggers pause after threshold exceeded
   - Displays work summary for human review

2. **LOC Threshold Gate** (exec-to-plan/gates/loc-threshold-validation.js)
   - Calculates LOC via git diff --stat
   - Applies to infrastructure/refactor sd_types
   - Blocks completion if threshold exceeded without handoff

3. **Task Recording Middleware** (lib/task-recorder.js or hooks/task-recorder.js)
   - Wraps Task tool invocations
   - Inserts into subagent_activations before/after execution
   - Provides complete audit trail for stop-hook

## Data Flow

Task Invocation → Recording Hook → subagent_activations INSERT → Task Execution → Completion Recording

EXEC Phase → git diff --stat → LOC Gate Check → EXEC-TO-PLAN Handoff (blocked if >500 LOC)

Autonomous Execution → Turn Counter → Checkpoint Hook → Human Review → Continue/Redirect

## Integration Points

- Claude Code hooks system (.claude/settings.json)
- Handoff executor gates (scripts/modules/handoff/executors/)
- subagent_activations table (existing)
- stop-subagent-enforcement.js (existing, consumes recorded data)
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'subagent_activations (existing)',
          columns: ['id', 'sd_id', 'phase', 'agent_type', 'triggered_by', 'activation_time', 'completion_time', 'result', 'context'],
          relationships: ['sd_id → strategic_directives_v2.id']
        }
      ],
      note: 'No schema changes - uses existing subagent_activations table'
    },

    api_specifications: [],  // Infrastructure SD - no API endpoints

    ui_ux_requirements: [],  // Infrastructure SD - no UI components

    // Implementation
    implementation_approach: `
## Phase 1: Task Recording Hooks (FR-3)
- Create lib/task-recorder.js or hooks/task-recorder.js
- Implement pre-execution recording (insert with status='started')
- Implement post-execution recording (update with status='completed'/'failed')
- Add error handling for recording failures (non-blocking)
- Test with manual Task invocations

## Phase 2: LOC Threshold Gate (FR-2)
- Create scripts/modules/handoff/executors/exec-to-plan/gates/loc-threshold-validation.js
- Implement git diff --stat parsing for LOC calculation
- Add sd_type filtering (infrastructure, refactor)
- Add configurable threshold (default 500, env var override)
- Register gate in exec-to-plan/index.js
- Test with mock handoff scenarios

## Phase 3: Autonomous Checkpoint Hook (FR-1)
- Create hooks/autonomous-checkpoint.js
- Implement turn counter (session-scoped)
- Implement checkpoint display with work summary
- Add configurable threshold (default 20, env var override)
- Register hook in .claude/settings.json
- Test with extended autonomous session
    `.trim(),

    technology_stack: [
      'Node.js',
      'JavaScript/ESM',
      'Supabase PostgreSQL',
      'Claude Code Hooks API',
      'Git CLI'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'subagent_activations table exists',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'exec-to-plan gate registration pattern',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Claude Code hooks system',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Task Recording Captures All Invocations',
        description: 'Invoke Task tool with subagent_type and verify recording in subagent_activations',
        expected_result: 'Row inserted with correct sd_id, agent_type, status',
        test_type: 'integration'
      },
      {
        id: 'TS-2',
        scenario: 'LOC Gate Blocks Large Changes',
        description: 'Attempt EXEC-TO-PLAN handoff for infrastructure SD with >500 LOC changes',
        expected_result: 'Gate returns blocking error with LOC count',
        test_type: 'integration'
      },
      {
        id: 'TS-3',
        scenario: 'LOC Gate Allows Small Changes',
        description: 'Attempt EXEC-TO-PLAN handoff for infrastructure SD with <500 LOC changes',
        expected_result: 'Gate passes, handoff proceeds',
        test_type: 'integration'
      },
      {
        id: 'TS-4',
        scenario: 'Checkpoint Triggers After Threshold',
        description: 'Execute autonomous session exceeding turn threshold',
        expected_result: 'Checkpoint hook pauses execution, displays summary',
        test_type: 'e2e'
      }
    ],

    acceptance_criteria: [
      'All Task tool calls with subagent_type recorded in database',
      'LOC threshold gate blocks infrastructure/refactor SDs with >500 LOC',
      'Checkpoint triggers after configurable turn threshold',
      'Recording failures do not block Task execution',
      'All thresholds configurable via environment variables'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Technical',
        risk: 'Checkpoint enforcement may interrupt legitimate long-running work',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'User frustration from unnecessary interruptions',
        mitigation: 'Make threshold configurable; allow checkpoint dismissal for known long tasks'
      },
      {
        category: 'Technical',
        risk: 'LOC calculation may be imprecise for complex git states',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'False positives/negatives in gate enforcement',
        mitigation: 'Use git diff --stat against proper base branch; add margin of error'
      },
      {
        category: 'Technical',
        risk: 'Task recording adds latency to every sub-agent call',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'Slower overall execution',
        mitigation: 'Async recording; non-blocking design; <50ms target'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing subagent_activations table schema',
        impact: 'No schema changes; work within existing column structure'
      },
      {
        type: 'technical',
        constraint: 'Must not modify Claude Code core (only hooks/gates)',
        impact: 'Implementation limited to hook-based and gate-based approaches'
      }
    ],

    assumptions: [
      {
        assumption: 'Claude Code hooks can access turn count',
        validation_method: 'Review Claude Code hook API documentation'
      },
      {
        assumption: 'git diff --stat provides accurate LOC for branch changes',
        validation_method: 'Test with known change sets'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      // REQUIRED: exploration_summary - Documents files explored during PLAN phase
      exploration_summary: [
        {
          file_path: 'scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.js',
          purpose: 'Understand existing gate pattern for EXEC-TO-PLAN',
          key_findings: 'Uses createXxxGate() pattern; returns { passed, score, details }; supports sd_type filtering'
        },
        {
          file_path: 'scripts/hooks/stop-subagent-enforcement.js',
          purpose: 'Review existing sub-agent enforcement mechanism',
          key_findings: 'Queries subagent_activations for enforcement decisions; runs at session END; has bypass mechanism'
        },
        {
          file_path: 'scripts/modules/handoff/executors/exec-to-plan/index.js',
          purpose: 'Understand gate registration pattern',
          key_findings: 'Gates registered via gates.push(createXxxGate()); gates run in sequence during handoff'
        },
        {
          file_path: '.claude/settings.json',
          purpose: 'Review Claude Code hooks configuration',
          key_findings: 'Hooks registered in hooks array; support stop, PreToolUse types; timeout configurable'
        },
        {
          file_path: 'docs/03_protocols_and_standards/LEO_v4.3_subagent_enforcement.md',
          purpose: 'Review sub-agent enforcement protocol documentation',
          key_findings: 'Documents requirements matrix, phase timing, auto-remediation flow'
        }
      ],
      estimated_hours: 8,
      affected_files: [
        'scripts/modules/handoff/executors/exec-to-plan/gates/loc-threshold-validation.js (NEW)',
        'scripts/modules/handoff/executors/exec-to-plan/index.js (MODIFY)',
        'lib/task-recorder.js or hooks/task-recorder.js (NEW)',
        'hooks/autonomous-checkpoint.js (NEW)',
        '.claude/settings.json (MODIFY)'
      ]
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Auto-invoke PLAN phase sub-agents (Gap #1 Fix)
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-invoking PLAN phase sub-agents...');

  try {
    // Dynamic import to avoid circular dependencies
    const { orchestrate } = await import('./orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', SD_ID, { autoRemediate: true });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log(`   ✅ Sub-agents completed: ${orchestrationResult.executed?.join(', ') || 'All required'}`);
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log(`   ⚠️  Some sub-agents had issues: ${JSON.stringify(orchestrationResult.summary)}`);
    } else {
      console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   You may need to run sub-agents manually for full compliance');
    }
  } catch (orchestrationError) {
    console.warn('   ⚠️  Sub-agent auto-invocation failed:', orchestrationError.message);
    console.log('   Sub-agents can be run manually later with:');
    console.log(`      node scripts/orchestrate-phase-subagents.js PLAN_PRD ${SD_ID}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: Success Summary
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Verify sub-agent results in database (auto-invoked above)');
  console.log('   3. Mark plan_checklist items as complete');
  console.log('   4. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
