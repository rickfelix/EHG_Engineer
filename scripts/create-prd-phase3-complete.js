#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('📋 Creating PRD for SD-BOARD-VISUAL-BUILDER-003');
  console.log('═'.repeat(80));

  // Get SD with uuid_id for sd_uuid field (prevents handoff validation failures)
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_key, title')
    .eq('sd_key', 'SD-BOARD-VISUAL-BUILDER-003')
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found');
    process.exit(1);
  }

  console.log(`🎯 Target SD: ${sd.title}`);
  console.log(`   SD uuid_id: ${sd.uuid_id}`);
  console.log('');

const prd = {
    id: 'PRD-BOARD-VISUAL-BUILDER-003',
    sd_uuid: sd.uuid_id,
    title: 'Visual Workflow Builder - Phase 3: Code Generation & Execution Engine',
    version: '1.0.0',
    status: 'approved',

    executive_summary: `Phase 3 completes the Visual Workflow Builder by adding backend code generation and secure execution capabilities. Users can generate CrewAI Flows Python code from visual workflows and execute them in sandboxed Docker containers with comprehensive tracking.

**Key Capabilities:** Python code generation, secure sandboxed execution, execution history tracking, board meeting integration, resource usage monitoring.

**Target Users:** Board members, workflow designers, system administrators.`,

    functional_requirements: `
## Code Generation (US-001)
- Convert React Flow JSON to CrewAI Flows Python code
- Support all node types (Start, Agent Task, Decision, Router, Parallel, Wait, End)
- AST validation for syntax correctness
- Store generated code in crewai_flows.python_code column

## Code Validation (US-004)
- Python AST syntax validation
- Import whitelist enforcement (crewai, anthropic, openai only)
- Validation error reporting with line numbers

## Sandboxed Execution (US-002)
- Docker container orchestration
- Resource limits: 2GB RAM, 2 CPUs, 5min timeout
- Network and filesystem isolation
- Real-time execution status tracking

## Execution History UI (US-003)
- List view with filters (workflow, status, date range)
- Pagination (25/50/100 rows)
- Detail view with input/output state
- Retry failed executions

## Error Handling (US-005)
- Capture Python exceptions
- User-friendly error messages
- Suggested fixes for common errors

## Board Meeting Integration (US-006)
- Link executions to board_meeting_id
- Filter executions by meeting

## Resource Tracking (US-007)
- Token count, cost in USD, duration tracking
- Dashboard with aggregate metrics

## Code Export (US-008)
- Generate standalone Python files
- Include setup instructions
`.trim(),

    technical_requirements: {
      components: [
        { name: 'CodeGenerationEngine', lines: 400 },
        { name: 'CodeValidationService', lines: 300 },
        { name: 'SandboxExecutionService', lines: 500 },
        { name: 'ExecutionHistoryView', lines: 400 },
        { name: 'ErrorHandlingSystem', lines: 200 }
      ],
      total_lines: 1800,
      database: 'No migrations needed - crewai_flows schema ready',
      security_critical: true
    },

    non_functional_requirements: {
      security: 'CRITICAL - Zero code injection, AST validation, Docker sandboxing',
      performance: 'Code generation <2s, execution startup <10s',
      scalability: '10 concurrent workflow executions',
      availability: '99.9% uptime'
    },

    test_scenarios: `
## Unit Tests
- Code generation accuracy
- Import whitelist enforcement
- Resource limit validation
- Error parsing correctness

## E2E Tests (100% user story coverage)
- US-001: Generate and preview Python code
- US-002: Execute workflow in sandbox
- US-003: View execution history
- US-004: Validate code (reject invalid)
- US-005: Display errors with retry
- US-006: Link to board meeting
- US-007: Track resource usage
- US-008: Export code as .py file
`.trim(),

    acceptance_criteria: [
      'All 8 user stories implemented',
      'Unit tests pass (100% coverage)',
      'E2E tests pass (all scenarios)',
      'Security validation blocks invalid code',
      'Performance targets met (<2s, <10s)',
      'Documentation complete'
    ],

    risks: [
      { risk: 'Code injection attacks', severity: 'CRITICAL', mitigation: 'AST validation + Docker sandboxing' },
      { risk: 'Resource exhaustion', severity: 'HIGH', mitigation: 'Enforced limits (2GB/2CPU/5min)' },
      { risk: 'Docker setup complexity', severity: 'MEDIUM', mitigation: 'Documentation + docker-compose template' }
    ],

    dependencies: [
      'Phase 1 complete (visual workflow builder)',
      'crewai_flows database schema',
      'Docker environment',
      'Python AST validation API'
    ],

    metadata: {
      phase: 3,
      story_points: 50,
      estimated_lines: 1800,
      complexity: 'HIGH',
      security_impact: 'CRITICAL'
    }
  };

  // Insert PRD
  const { data: prdData, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, title');

  if (prdError) {
    console.error('❌ Error creating PRD:', prdError.message);
    process.exit(1);
  }

  console.log('✅ PRD created successfully');
  console.log(`   ID: ${prdData[0].id}`);
  console.log(`   Title: ${prdData[0].title}`);
  console.log('');
  console.log('📊 PRD Summary:');
  console.log('   - User Stories: 8 stories, 50 points');
  console.log('   - Components: 5 major components, ~1800 LOC');
  console.log('   - Database: No migrations needed');
  console.log('   - Security: CRITICAL - 3 threat mitigations');
  console.log('   - Testing: Dual testing (unit + E2E)');
  console.log('');
  console.log('🎯 PLAN phase complete - Ready for EXEC');
}

main();
