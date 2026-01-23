#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-GENESIS-V32-PULSE with your SD ID (e.g., SD-AUTH-001)
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

const SD_ID = 'SD-GENESIS-V32-PULSE'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'Self-Healing Heart - Retry & Recovery System'; // TODO: Replace with your PRD title

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

  // SD ID Schema Cleanup: Use SD.id directly (uuid_id is deprecated)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id
    id: prdId,
    sd_id: SD_ID,                   // FK to strategic_directives_v2.id (canonical)
    directive_id: SD_ID,            // Backward compatibility

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: 'infrastructure',
    priority: 'critical', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
Build resilient retry/backoff infrastructure for all external API calls (OpenAI, Vercel, Supabase).

This infrastructure SD addresses a P0 critical gap discovered during triangulation: the leo_error_log
table that code writes to does not actually exist in the database. Additionally, external API calls
currently have no retry logic, causing silent failures when APIs are rate-limited or temporarily unavailable.

PULSE implements exponential backoff with jitter to prevent thundering herd scenarios, detects
non-retryable errors (401/403) to fail fast, and refactors _logErrorSilently to _attemptRecovery
with actionable guidance for operators. As an infrastructure SD, PULSE has no E2E test requirements.
    `.trim(),

    business_context: `
**Problem Statement:**
External API calls (OpenAI, Vercel, Supabase) currently fail silently without retry logic. The
leo_error_log table that HandoffRecorder writes to does not exist, causing additional silent failures.

**Business Impact:**
- Reduced reliability of LEO Protocol handoffs due to transient API failures
- No audit trail of critical errors (table missing)
- Operators have no actionable guidance when failures occur

**Success Metrics:**
- leo_error_log table created and receiving error logs
- Retry success rate >90% for recoverable errors
- Zero silent failures for external API calls
    `.trim(),

    technical_context: `
**Existing Systems:**
- HandoffRecorder.js uses _logErrorSilently() that writes to non-existent leo_error_log
- External API calls in genesis pipeline have no retry logic
- Supabase client used throughout for database operations

**Architecture Patterns:**
- Resilience pattern: Exponential backoff with jitter
- Circuit breaker pattern for repeated failures
- Recovery guidance pattern for operator action

**Integration Points:**
- OpenAI API (PRD/schema generation)
- Vercel API (preview deployments)
- Supabase API (database operations)
    `.trim(),

    // Requirements (JSONB arrays)
    functional_requirements: [
      {
        id: 'FR-001',
        requirement: 'Create leo_error_log table for critical failure persistence',
        description: 'Database table to store critical errors with context, timestamp, error type, and recovery guidance. P0 fix - this table is referenced by code but does not exist.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Table created with columns: id, timestamp, error_type, context, recovery_guidance, severity',
          'RLS policies enabled for LEO service role access',
          'Index on timestamp for efficient querying of recent errors'
        ]
      },
      {
        id: 'FR-002',
        requirement: 'Implement retry-executor.js with exponential backoff and jitter',
        description: 'Reusable retry wrapper module that handles external API calls with configurable retry logic. Uses exponential backoff with random jitter to prevent thundering herd.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Max 3 retry attempts with configurable override',
          'Exponential backoff: 1s, 2s, 4s base delays',
          'Random jitter (0-500ms) added to each delay',
          'Auth failures (401/403) bypass retry and fail immediately',
          'Final failure logs CRITICAL to leo_error_log with context'
        ]
      },
      {
        id: 'FR-003',
        requirement: 'Refactor _logErrorSilently to _attemptRecovery with guidance',
        description: 'Replace silent error logging with recovery-focused approach that provides actionable next steps for operators.',
        priority: 'HIGH',
        acceptance_criteria: [
          'HandoffRecorder._logErrorSilently renamed to _attemptRecovery',
          '_attemptRecovery logs to leo_error_log with recovery_guidance field',
          'Recovery guidance includes specific remediation steps',
          'Error context includes SD ID, handoff type, and stack trace'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'reliability',
        requirement: 'Retry mechanism must be idempotent',
        target_metric: 'Retrying the same operation produces the same result without side effects'
      },
      {
        type: 'performance',
        requirement: 'Retry overhead must not exceed 10s total',
        target_metric: 'Max total delay: 1s + 2s + 4s + 1.5s jitter = ~8.5s'
      },
      {
        type: 'observability',
        requirement: 'All retries must be logged with attempt count',
        target_metric: 'Console log format: "Retry {attempt}/{max} in {delay}ms..."'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-001',
        requirement: 'Use async/await pattern for retry wrapper',
        description: 'Retry executor must support Promise-based operations and maintain async context',
        dependencies: ['Node.js 18+']
      },
      {
        id: 'TR-002',
        requirement: 'Use Supabase client for leo_error_log writes',
        description: 'Error logging uses existing Supabase service role client, not anonymous access',
        dependencies: ['@supabase/supabase-js', 'SUPABASE_SERVICE_ROLE_KEY']
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview
The PULSE resilience layer provides a reusable retry wrapper and error logging infrastructure.

\`\`\`
┌─────────────────────────────────────────────────────────┐
│                    External API Call                     │
├─────────────────────────────────────────────────────────┤
│                   withRetry() Wrapper                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Attempt 1 ─→ Success? ─→ Return result              ││
│  │     │                                               ││
│  │     ↓ (failure)                                     ││
│  │ Is retryable? ──No──→ Log + throw immediately       ││
│  │     │                                               ││
│  │     ↓ (yes)                                         ││
│  │ Wait (backoff + jitter)                             ││
│  │     ↓                                               ││
│  │ Attempt 2...3 ─→ Final failure ─→ Log CRITICAL      ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│                   leo_error_log table                    │
│  (persistent storage for CRITICAL errors)               │
└─────────────────────────────────────────────────────────┘
\`\`\`

## Data Flow
1. Caller invokes withRetry(operation, options)
2. Retry executor attempts operation
3. On failure: check if retryable (not 401/403)
4. If retryable: wait backoff + jitter, retry
5. After max attempts: log to leo_error_log with recovery guidance
6. Throw enriched error to caller

## Integration Points
- HandoffRecorder.js: Primary consumer of retry wrapper
- Genesis pipeline: OpenAI/Vercel API calls
- Supabase: Database writes for error logging
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'leo_error_log',
          columns: [
            'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
            'timestamp TIMESTAMPTZ DEFAULT NOW()',
            'error_type TEXT NOT NULL',
            'severity TEXT CHECK (severity IN (\'warning\', \'error\', \'critical\'))',
            'context JSONB NOT NULL DEFAULT \'{}\'',
            'recovery_guidance TEXT',
            'sd_id TEXT',
            'handoff_type TEXT',
            'stack_trace TEXT',
            'resolved_at TIMESTAMPTZ',
            'resolved_by TEXT'
          ],
          relationships: ['sd_id references strategic_directives_v2.id (optional)']
        }
      ]
    },

    api_specifications: [
      {
        endpoint: 'N/A - Infrastructure Module',
        method: 'N/A',
        description: 'PULSE is a JavaScript module, not an API endpoint. It exports withRetry() and logCriticalError() functions.',
        request: { note: 'Function call: await withRetry(operation, options)' },
        response: { note: 'Returns operation result or throws enriched error' }
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A - No UI',
        description: 'PULSE is infrastructure-only. No user interface components.',
        wireframe: 'N/A'
      }
    ],

    // Implementation
    implementation_approach: `
## Phase 1: Database Migration (Day 1)
- Create leo_error_log table migration
- Add RLS policies for service role access
- Add index on timestamp column
- Test migration in development

## Phase 2: Retry Executor Module (Day 1-2)
- Create scripts/modules/resilience/retry-executor.js
- Implement withRetry() wrapper with options
- Add exponential backoff calculation
- Add random jitter (0-500ms)
- Detect non-retryable errors (401, 403)
- Integrate with leo_error_log for final failures

## Phase 3: HandoffRecorder Refactor (Day 2)
- Locate _logErrorSilently in HandoffRecorder.js
- Rename to _attemptRecovery
- Update to use leo_error_log table
- Add recovery_guidance field population
- Add context enrichment (SD ID, handoff type)

## Phase 4: Testing & Validation (Day 2-3)
- Unit tests for retry-executor.js
- Integration test with simulated API failures
- Verify leo_error_log receives entries
- Validate recovery guidance format
    `.trim(),

    technology_stack: [
      'Node.js 18+',
      'JavaScript (ES Modules)',
      '@supabase/supabase-js',
      'PostgreSQL (Supabase)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'Supabase service role key configured',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'HandoffRecorder.js exists',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation (Infrastructure SD - no E2E required)
    test_scenarios: [
      {
        id: 'TS-001',
        scenario: 'Retry on transient failure',
        description: 'withRetry should retry 3 times on network errors before failing',
        expected_result: 'Operation retried 3 times with exponential backoff, final failure logged',
        test_type: 'unit'
      },
      {
        id: 'TS-002',
        scenario: 'No retry on auth failure',
        description: 'withRetry should NOT retry on 401 or 403 errors',
        expected_result: 'Operation fails immediately without retry, auth error logged',
        test_type: 'unit'
      },
      {
        id: 'TS-003',
        scenario: 'Jitter prevents thundering herd',
        description: 'Multiple concurrent retries should have different delay times',
        expected_result: 'Random jitter (0-500ms) added to each delay',
        test_type: 'unit'
      },
      {
        id: 'TS-004',
        scenario: 'Error logged to leo_error_log',
        description: 'Final failure should write to leo_error_log table',
        expected_result: 'Row inserted with error_type, context, recovery_guidance',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'leo_error_log table created and accessible via Supabase client',
      'withRetry() function exported from retry-executor.js',
      'Retry uses exponential backoff: 1s, 2s, 4s base delays',
      'Random jitter (0-500ms) added to each retry delay',
      'Auth errors (401/403) bypass retry and fail immediately',
      '_logErrorSilently renamed to _attemptRecovery in HandoffRecorder',
      'All unit tests pass (no E2E required for infrastructure SD)'
    ],

    performance_requirements: {
      max_retry_duration: '<10s total',
      error_log_write_time: '<100ms',
      jitter_range: '0-500ms random'
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
        risk: 'Retry wrapper adds latency to all API calls',
        severity: 'LOW',
        probability: 'LOW',
        impact: 'Slightly slower happy-path operations due to wrapper overhead',
        mitigation: 'Wrapper has minimal overhead (<1ms) when no retries needed'
      },
      {
        category: 'Technical',
        risk: 'leo_error_log table fills up over time',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Database storage growth, slower queries',
        mitigation: 'Add scheduled cleanup job to archive old errors (future enhancement)'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'Must use existing Supabase client infrastructure',
        impact: 'Cannot use alternative database clients or ORMs'
      },
      {
        type: 'technical',
        constraint: 'Must be backwards compatible with existing HandoffRecorder callers',
        impact: '_attemptRecovery must maintain same call signature as _logErrorSilently'
      }
    ],

    assumptions: [
      {
        assumption: 'SUPABASE_SERVICE_ROLE_KEY is available in environment',
        validation_method: 'Check .env file for key presence'
      },
      {
        assumption: 'Network errors are transient and will succeed on retry',
        validation_method: 'Most network errors resolve within 3 retry attempts (based on industry data)'
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
      // Store custom fields here that aren't in the official schema
      // Examples:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
      // etc.
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
  // STEP 6: Success!
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
  console.log('   2. Run STORIES sub-agent: node scripts/create-user-stories-[sd-id].mjs');
  console.log('   3. Run DATABASE sub-agent: node scripts/database-architect-schema-review.js');
  console.log('   4. Run SECURITY sub-agent: node scripts/security-architect-assessment.js');
  console.log('   5. Mark plan_checklist items as complete');
  console.log('   6. Create PLAN→EXEC handoff when ready');
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
