#!/usr/bin/env node
/**
 * Create E2E Test Orchestrator SD with Child SDs
 *
 * Creates the parent orchestrator and 8 child SDs for systematic E2E test execution.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parent Orchestrator SD
const parentSD = {
  id: 'SD-E2E-TEST-ORCHESTRATOR',
  title: 'E2E Test Systematic Execution Orchestrator',
  category: 'Quality Assurance',
  priority: 'high',
  status: 'draft',
  sd_type: 'infrastructure',
  sd_key: 'E2E-ORCHESTRATOR',
  description: 'Parent orchestrator for systematic execution of all 37 E2E test files across 8 logical groupings. Ensures comprehensive test coverage with proper dependency ordering and gate enforcement.',
  rationale: 'The E2E test suite has grown to 37 files with 524+ test cases. Systematic execution with clear pass/fail reporting is needed to ensure quality gates are enforced and regressions are caught early.',
  scope: 'All E2E tests in /tests/e2e directory including: agents (5), brand-variants (5), state-machine (3), venture-creation (5), venture-lifecycle (7), websocket-auth (6), and root-level tests (6).',
  relationship_type: 'parent',
  parent_sd_id: null,
  sequence_rank: 1
};

// Child SDs
const childSDs = [
  {
    id: 'SD-E2E-FOUNDATION-001',
    title: 'E2E Foundation: Core Infrastructure Tests',
    category: 'Quality Assurance',
    priority: 'critical',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-FOUNDATION',
    description: 'Core infrastructure tests that ALL other tests depend on. Validates state machine, phase handoffs, PRD/SD CRUD, and budget enforcement. Must pass before any feature testing.',
    rationale: 'Foundation tests validate the core systems (Golden Nugget validation, JIT cache, Truth Layer, budget kill-switch) that all other functionality depends on.',
    scope: 'Tests: state-machine/ (3 files), phase-handoffs.spec.ts, prd-management.spec.ts, strategic-directives-crud.spec.ts, agents/sub-agent-invocation.spec.ts, agents/budget-kill-switch.spec.ts, agents/memory-isolation.spec.ts. Total: 9 files, ~120 test cases.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 1,
    dependency_chain: JSON.stringify({ dependencies: [], execution_order: 1 })
  },
  {
    id: 'SD-E2E-VENTURE-CREATION-002',
    title: 'E2E Venture Creation: Entry Path Flows',
    category: 'Quality Assurance',
    priority: 'high',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-VENTURE-CREATION',
    description: 'Tests user-facing venture creation workflows including all three entry paths (Manual, Competitor Clone, Blueprint Browse) and Stage 1 output unification.',
    rationale: 'Venture creation is the primary user entry point. These tests validate that users can successfully create ventures through all supported paths.',
    scope: 'Tests: venture-creation/ (5 files) - entry-path-selector.spec.ts, manual-entry-path.spec.ts, competitor-clone-path.spec.ts, blueprint-browse-path.spec.ts, stage1-output-unification.spec.ts. Total: 5 files, ~85 test cases. Requires LEO Stack running.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 2,
    dependency_chain: JSON.stringify({ dependencies: ['SD-E2E-FOUNDATION-001'], execution_order: 2 })
  },
  {
    id: 'SD-E2E-VENTURE-LIFECYCLE-003',
    title: 'E2E Venture Lifecycle: Full Stage Progression',
    category: 'Quality Assurance',
    priority: 'high',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-VENTURE-LIFECYCLE',
    description: 'Tests end-to-end venture progression through all 25 stages across 6 phases. Validates stage dependencies, required artifacts, decision gates, and SD requirements.',
    rationale: 'The venture lifecycle is the core product journey. These tests ensure ventures can progress from Stage 1 to Stage 25 with all quality gates enforced.',
    scope: 'Tests: venture-lifecycle/ (7 files) - phase1-the-truth.spec.ts through phase6-launch-and-learn.spec.ts plus full-journey.spec.ts. Total: 7 files, ~140 test cases. Long-running tests.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 3,
    dependency_chain: JSON.stringify({ dependencies: ['SD-E2E-FOUNDATION-001', 'SD-E2E-VENTURE-CREATION-002'], execution_order: 3 })
  },
  {
    id: 'SD-E2E-BRAND-VARIANTS-004',
    title: 'E2E Brand Variants: Adaptive Naming System',
    category: 'Quality Assurance',
    priority: 'medium',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-BRAND-VARIANTS',
    description: 'Tests Stage 10 (Strategic Naming) brand variant workflows including manual entry, domain validation, chairman approval, and lifecycle transitions.',
    rationale: 'Brand naming is a critical Stage 10 workflow. These tests validate the complete brand variant lifecycle from creation to approval.',
    scope: 'Tests: brand-variants/ (5 files) - manual-entry.spec.ts, domain-validation.spec.ts, chairman-approval.spec.ts, lifecycle-transitions.spec.ts, table-operations.spec.ts. Total: 5 files, ~60 test cases.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 4,
    dependency_chain: JSON.stringify({ dependencies: ['SD-E2E-FOUNDATION-001'], execution_order: 4 })
  },
  {
    id: 'SD-E2E-AGENT-RUNTIME-005',
    title: 'E2E Agent Runtime: Autonomous Agent Systems',
    category: 'Quality Assurance',
    priority: 'medium',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-AGENT-RUNTIME',
    description: 'Tests autonomous agent execution and orchestration including Venture CEO runtime, message processing, budget validation, business hypothesis tracking, and CrewAI flow execution.',
    rationale: 'The agent runtime is the autonomous execution layer. These tests validate that agents properly claim messages, enforce budgets, and execute CrewAI flows.',
    scope: 'Tests: agents/venture-ceo-runtime.spec.ts, agents/crewai-flow-execution.spec.ts. Total: 2 files, ~40 test cases. Requires agent-platform running on port 8000.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 5,
    dependency_chain: JSON.stringify({ dependencies: ['SD-E2E-FOUNDATION-001'], execution_order: 5 })
  },
  {
    id: 'SD-E2E-WEBSOCKET-AUTH-006',
    title: 'E2E WebSocket Auth: Security Tests (Skipped)',
    category: 'Quality Assurance',
    priority: 'low',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-WEBSOCKET-AUTH',
    description: 'Backend WebSocket security tests. Currently SKIPPED in favor of Python unit tests in agent-platform/tests/unit/test_websocket_rate_limiter.py.',
    rationale: 'These tests are placeholders. Security coverage exists in Python unit tests. Review for potential removal or conversion to integration tests.',
    scope: 'Tests: websocket-auth/ (6 files) - US-001 through US-006. All tests are marked as SKIPPED. Total: 6 files, ~6 test cases (all skipped).',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 6,
    dependency_chain: JSON.stringify({ dependencies: [], execution_order: 6, note: 'DEPRIORITIZED - tests are skipped' })
  },
  {
    id: 'SD-E2E-KNOWLEDGE-INTEGRATION-007',
    title: 'E2E Knowledge Integration: External Systems',
    category: 'Quality Assurance',
    priority: 'low',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-KNOWLEDGE-INTEGRATION',
    description: 'Tests external integrations including Context7 MCP failure handling and knowledge retrieval flows. Non-critical for core functionality.',
    rationale: 'External integrations may be unreliable. These tests validate graceful degradation when Context7 or knowledge systems are unavailable.',
    scope: 'Tests: context7-failure-scenarios.spec.ts, knowledge-retrieval-flow.spec.ts. Total: 2 files, ~25 test cases.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 7,
    dependency_chain: JSON.stringify({ dependencies: [], execution_order: 7 })
  },
  {
    id: 'SD-E2E-LEGACY-CLEANUP-008',
    title: 'E2E Legacy Cleanup: Test Migration',
    category: 'Quality Assurance',
    priority: 'low',
    status: 'draft',
    sd_type: 'infrastructure',
    sd_key: 'E2E-LEGACY-CLEANUP',
    description: 'Old/example tests that need review for deletion or migration. Includes diagnostic tests and superseded workflow tests.',
    rationale: 'Legacy tests may be obsolete or duplicated by newer tests. Review and cleanup will reduce maintenance burden.',
    scope: 'Tests: story-example.spec.js, venture-creation-workflow.spec.js, venture-creation-event-listener-diagnostic.spec.ts, visual-inspection.spec.js. Total: 4 files. Review for deletion.',
    relationship_type: 'child',
    parent_sd_id: 'SD-E2E-TEST-ORCHESTRATOR',
    sequence_rank: 8,
    dependency_chain: JSON.stringify({ dependencies: [], execution_order: 8, note: 'CLEANUP - review for deletion' })
  }
];

async function createSDs() {
  console.log('Creating E2E Test Orchestrator SD structure...\n');

  // Create parent SD
  console.log('1. Creating parent orchestrator SD...');
  const { data: parent, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .upsert(parentSD, { onConflict: 'id' })
    .select('id, title');

  if (parentError) {
    console.error('   ERROR creating parent:', parentError.message);
    process.exit(1);
  }
  console.log(`   ✅ Created: ${parent[0].id} - ${parent[0].title}\n`);

  // Create child SDs
  console.log('2. Creating child SDs...');
  for (const childSD of childSDs) {
    const { data: child, error: childError } = await supabase
      .from('strategic_directives_v2')
      .upsert(childSD, { onConflict: 'id' })
      .select('id, title, priority');

    if (childError) {
      console.error(`   ❌ ERROR creating ${childSD.id}:`, childError.message);
    } else {
      console.log(`   ✅ [${child[0].priority.toUpperCase()}] ${child[0].id} - ${child[0].title}`);
    }
  }

  console.log('\n========================================');
  console.log('SD Structure Created Successfully!');
  console.log('========================================\n');
  console.log('Parent: SD-E2E-TEST-ORCHESTRATOR');
  console.log('Children: 8 child SDs created\n');
  console.log('Execution Order:');
  console.log('  1. SD-E2E-FOUNDATION-001 (P0 - Critical)');
  console.log('  2. SD-E2E-VENTURE-CREATION-002 (P1 - High)');
  console.log('  3. SD-E2E-VENTURE-LIFECYCLE-003 (P1 - High)');
  console.log('  4. SD-E2E-BRAND-VARIANTS-004 (P2 - Medium)');
  console.log('  5. SD-E2E-AGENT-RUNTIME-005 (P2 - Medium)');
  console.log('  6. SD-E2E-WEBSOCKET-AUTH-006 (P3 - Low, Skipped)');
  console.log('  7. SD-E2E-KNOWLEDGE-INTEGRATION-007 (P3 - Low)');
  console.log('  8. SD-E2E-LEGACY-CLEANUP-008 (P4 - Backlog)\n');
}

createSDs().catch(console.error);
