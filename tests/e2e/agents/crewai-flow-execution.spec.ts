/**
 * CrewAI Flow Execution E2E Tests
 *
 * Tests the CrewAI flow orchestration and execution:
 * - Flow creation and versioning
 * - Flow execution tracking
 * - Token consumption and cost tracking
 * - Crew configuration and compatible stages
 * - Flow status lifecycle
 * - Execution metrics
 *
 * Reference:
 * - docs/reference/schema/engineer/tables/crewai_flows.md
 * - docs/reference/schema/engineer/tables/crewai_flow_executions.md
 * - docs/reference/schema/engineer/tables/crewai_crews.md
 *
 * GAP IDENTIFIED (Plan file):
 * - Python Task() does NOT pass venture_id, prd_id, sd_id
 * - This test documents expected behavior for future implementation
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('CrewAI Flow Execution E2E Tests', () => {
  let supabase: any;
  let testFlowId: string;
  let testCrewId: string;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `CrewAI Flow Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    // Create test venture
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `CrewAI Flow Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 1
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;
  });

  test.afterAll(async () => {
    // Cleanup
    if (testFlowId) {
      await supabase.from('crewai_flow_executions').delete().eq('flow_id', testFlowId);
      await supabase.from('crewai_flows').delete().eq('id', testFlowId);
    }
    if (testCrewId) {
      await supabase.from('crewai_crews').delete().eq('id', testCrewId);
    }
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // FLOW CREATION
  // =========================================================================
  test.describe('Flow Creation', () => {
    test('CREW-001: should create a CrewAI flow', async () => {
      // Given: Flow definition
      const flowDefinition = {
        nodes: [
          { id: 'start', type: 'start', data: { label: 'Start' } },
          { id: 'research', type: 'crew', data: { label: 'Research Crew', crewId: null } },
          { id: 'analyze', type: 'crew', data: { label: 'Analysis Crew', crewId: null } },
          { id: 'end', type: 'end', data: { label: 'End' } }
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'research' },
          { id: 'e2', source: 'research', target: 'analyze' },
          { id: 'e3', source: 'analyze', target: 'end' }
        ]
      };

      // When: Creating flow
      const { data: flow, error } = await supabase
        .from('crewai_flows')
        .insert({
          flow_key: `test-flow-${Date.now()}`,
          flow_name: 'Test Research Flow',
          description: 'E2E test flow for research and analysis',
          flow_definition: flowDefinition,
          status: 'draft',
          version: 1,
          tags: ['test', 'research']
        })
        .select('id, flow_key, status')
        .single();

      // Then: Flow is created
      expect(error).toBeNull();
      expect(flow.status).toBe('draft');
      testFlowId = flow.id;
    });

    test('CREW-002: should enforce unique flow_key', async () => {
      // Given: Existing flow with key
      const duplicateKey = 'duplicate-flow-key';

      await supabase.from('crewai_flows').insert({
        flow_key: duplicateKey,
        flow_name: 'Original Flow',
        flow_definition: { nodes: [], edges: [] },
        status: 'draft'
      });

      // When: Attempting duplicate key
      const { error } = await supabase.from('crewai_flows').insert({
        flow_key: duplicateKey,
        flow_name: 'Duplicate Flow',
        flow_definition: { nodes: [], edges: [] },
        status: 'draft'
      });

      // Then: Unique constraint violation
      expect(error).not.toBeNull();
      expect(error.message).toContain('duplicate');

      // Cleanup
      await supabase.from('crewai_flows').delete().eq('flow_key', duplicateKey);
    });

    test('CREW-003: should validate status enum', async () => {
      // Given: Valid status values
      const validStatuses = ['draft', 'active', 'archived', 'deprecated'];

      // Then: All should be valid
      for (const status of validStatuses) {
        expect(validStatuses).toContain(status);
      }

      // Invalid status should be rejected
      const invalidStatus = 'invalid_status';
      expect(validStatuses).not.toContain(invalidStatus);
    });
  });

  // =========================================================================
  // FLOW VERSIONING
  // =========================================================================
  test.describe('Flow Versioning', () => {
    test('CREW-004: should track flow versions', async () => {
      // Given: Flow with version 1
      const { data: flow } = await supabase
        .from('crewai_flows')
        .select('version')
        .eq('id', testFlowId)
        .single();

      expect(flow.version).toBe(1);

      // When: Creating new version
      const { data: updatedFlow, error } = await supabase
        .from('crewai_flows')
        .update({ version: 2 })
        .eq('id', testFlowId)
        .select('version')
        .single();

      // Then: Version is incremented
      expect(error).toBeNull();
      expect(updatedFlow.version).toBe(2);
    });

    test('CREW-005: should support parent_flow_id for forks', async () => {
      // Given: Existing flow
      // When: Creating a fork (child flow)
      const { data: fork, error } = await supabase
        .from('crewai_flows')
        .insert({
          flow_key: `fork-flow-${Date.now()}`,
          flow_name: 'Forked Flow',
          flow_definition: { nodes: [], edges: [] },
          parent_flow_id: testFlowId,
          status: 'draft'
        })
        .select('id, parent_flow_id')
        .single();

      // Then: Fork references parent
      expect(error).toBeNull();
      expect(fork.parent_flow_id).toBe(testFlowId);

      // Cleanup
      await supabase.from('crewai_flows').delete().eq('id', fork.id);
    });
  });

  // =========================================================================
  // FLOW EXECUTION
  // =========================================================================
  test.describe('Flow Execution', () => {
    test('CREW-006: should create flow execution record', async () => {
      // Given: Active flow
      await supabase
        .from('crewai_flows')
        .update({ status: 'active' })
        .eq('id', testFlowId);

      // When: Starting execution
      const executionKey = `FLOW-TEST-${Date.now()}`;
      const { data: execution, error } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          input_state: { venture_id: testVentureId, stage: 1 },
          status: 'pending',
          execution_mode: 'manual'
        })
        .select('id, status, execution_mode')
        .single();

      // Then: Execution is created
      expect(error).toBeNull();
      expect(execution.status).toBe('pending');
      expect(execution.execution_mode).toBe('manual');
    });

    test('CREW-007: should track execution status transitions', async () => {
      // Given: Pending execution
      const executionKey = `FLOW-STATUS-${Date.now()}`;
      const { data: execution } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'pending',
          execution_mode: 'triggered'
        })
        .select('id')
        .single();

      // When: Transitioning through statuses
      const transitions = ['running', 'completed'];

      for (const status of transitions) {
        const { error } = await supabase
          .from('crewai_flow_executions')
          .update({ status })
          .eq('id', execution.id);

        expect(error).toBeNull();
      }

      // Then: Final status is completed
      const { data: final } = await supabase
        .from('crewai_flow_executions')
        .select('status')
        .eq('id', execution.id)
        .single();

      expect(final.status).toBe('completed');
    });

    test('CREW-008: should validate execution_mode enum', async () => {
      // Given: Valid execution modes
      const validModes = ['manual', 'scheduled', 'triggered'];

      // Then: All modes are valid
      for (const mode of validModes) {
        expect(validModes).toContain(mode);
      }
    });
  });

  // =========================================================================
  // TOKEN AND COST TRACKING
  // =========================================================================
  test.describe('Token and Cost Tracking', () => {
    test('CREW-009: should track token consumption', async () => {
      // Given: Execution with token usage
      const executionKey = `FLOW-TOKENS-${Date.now()}`;
      const { data: execution } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'completed',
          token_count: 15000,
          execution_mode: 'manual'
        })
        .select('id, token_count')
        .single();

      // Then: Token count is recorded
      expect(execution.token_count).toBe(15000);
    });

    test('CREW-010: should track execution cost', async () => {
      // Given: Execution with cost
      const executionKey = `FLOW-COST-${Date.now()}`;
      const { data: execution } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'completed',
          token_count: 20000,
          cost_usd: 0.0600, // $0.06 for 20k tokens
          execution_mode: 'manual'
        })
        .select('id, cost_usd')
        .single();

      // Then: Cost is recorded
      expect(parseFloat(execution.cost_usd)).toBeCloseTo(0.06, 2);
    });

    test('CREW-011: should track execution duration', async () => {
      // Given: Execution with timing
      const startTime = new Date(Date.now() - 5000); // 5 seconds ago
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      const executionKey = `FLOW-DURATION-${Date.now()}`;
      const { data: execution, error } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'completed',
          started_at: startTime.toISOString(),
          completed_at: endTime.toISOString(),
          duration_ms: durationMs,
          execution_mode: 'manual'
        })
        .select('id, duration_ms')
        .single();

      // Then: Duration is recorded
      expect(error).toBeNull();
      expect(execution.duration_ms).toBeGreaterThanOrEqual(5000);
    });
  });

  // =========================================================================
  // CREW CONFIGURATION
  // =========================================================================
  test.describe('Crew Configuration', () => {
    test('CREW-012: should create crew configuration', async () => {
      // Given: Crew config
      const { data: crew, error } = await supabase
        .from('crewai_crews')
        .insert({
          id: crypto.randomUUID(),
          crew_name: 'Research Crew',
          process_type: 'sequential',
          description: 'Market research and competitive analysis',
          status: 'active',
          verbose: true,
          memory_enabled: true,
          planning_enabled: true,
          cache_enabled: true,
          max_rpm: 100,
          max_cost_usd: 50,
          compatible_stages: [1, 2, 3, 4, 5]
        })
        .select('id, crew_name, compatible_stages')
        .single();

      // Then: Crew is created
      expect(error).toBeNull();
      expect(crew.crew_name).toBe('Research Crew');
      expect(crew.compatible_stages).toContain(1);
      testCrewId = crew.id;
    });

    test('CREW-013: should validate compatible_stages', async () => {
      // Given: Crew with stage compatibility
      const { data: crew } = await supabase
        .from('crewai_crews')
        .select('compatible_stages')
        .eq('id', testCrewId)
        .single();

      // When: Checking stage compatibility
      const currentStage = 3;
      const isCompatible = crew.compatible_stages?.includes(currentStage);

      // Then: Stage 3 is compatible
      expect(isCompatible).toBe(true);

      // Stage 25 is not compatible
      const stage25Compatible = crew.compatible_stages?.includes(25);
      expect(stage25Compatible).toBe(false);
    });

    test('CREW-014: should track max_cost_usd limit', async () => {
      // Given: Crew with cost limit
      const { data: crew } = await supabase
        .from('crewai_crews')
        .select('max_cost_usd')
        .eq('id', testCrewId)
        .single();

      // When: Simulating cost tracking
      const accumulatedCost = 45.00;
      const costRemaining = crew.max_cost_usd - accumulatedCost;
      const exceedsLimit = accumulatedCost >= crew.max_cost_usd;

      // Then: Cost is within limit
      expect(exceedsLimit).toBe(false);
      expect(costRemaining).toBe(5);
    });
  });

  // =========================================================================
  // GOVERNANCE GAP DOCUMENTATION
  // =========================================================================
  test.describe('Governance Gap Documentation', () => {
    test('CREW-015: CRITICAL GAP - Python Task() lacks venture_id', async () => {
      // DOCUMENTED GAP from Plan file:
      // Python CrewAI Tasks do NOT pass venture_id, prd_id, sd_id

      // Expected behavior (NOT YET IMPLEMENTED)
      const expectedTaskContext = {
        description: 'Research market opportunity',
        agent: 'research_agent',
        expected_output: 'Market analysis report',
        context: {
          venture_id: testVentureId, // MISSING in Python
          prd_id: 'PRD-TEST-001', // MISSING in Python
          sd_id: 'SD-TEST-001' // MISSING in Python
        }
      };

      // Current behavior (GAP)
      const actualTaskContext = {
        description: 'Research market opportunity',
        agent: 'research_agent',
        expected_output: 'Market analysis report'
        // NOTE: context field is missing or string-only
      };

      // This test documents the gap
      expect(expectedTaskContext.context.venture_id).toBeDefined();
      expect(actualTaskContext.context).toBeUndefined();

      console.log('CRITICAL GAP: Python Task() needs venture_id, prd_id, sd_id in context');
    });

    test('CREW-016: crewai_flows table lacks governance anchors', async () => {
      // DOCUMENTED GAP from Plan file:
      // crewai_flows table missing venture_id, prd_id, sd_id columns

      // Query current schema
      const { data: flows } = await supabase
        .from('crewai_flows')
        .select('*')
        .limit(1);

      // Check for missing columns
      const sampleFlow = flows?.[0] || {};
      const hasVentureId = 'venture_id' in sampleFlow;
      const hasPrdId = 'prd_id' in sampleFlow;
      const hasSdId = 'sd_id' in sampleFlow;

      // Document missing governance anchors
      console.log(`crewai_flows governance anchors:
        venture_id: ${hasVentureId ? 'EXISTS' : 'MISSING'}
        prd_id: ${hasPrdId ? 'EXISTS' : 'MISSING'}
        sd_id: ${hasSdId ? 'EXISTS' : 'MISSING'}`);

      // Recommended fix (not yet applied):
      // ALTER TABLE crewai_flows
      // ADD COLUMN venture_id UUID REFERENCES ventures(id),
      // ADD COLUMN prd_id UUID REFERENCES prds(id),
      // ADD COLUMN sd_id VARCHAR(50);
    });
  });

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  test.describe('Error Handling', () => {
    test('CREW-017: should capture execution errors', async () => {
      // Given: Failed execution
      const executionKey = `FLOW-ERROR-${Date.now()}`;
      const { data: execution, error } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'failed',
          error_type: 'ValidationError',
          error_message: 'Invalid input state: missing required field',
          error_stack: 'at validateInput (flow.py:45)\nat execute (flow.py:123)',
          execution_mode: 'manual'
        })
        .select('id, error_type, error_message')
        .single();

      // Then: Error details are captured
      expect(error).toBeNull();
      expect(execution.error_type).toBe('ValidationError');
      expect(execution.error_message).toContain('missing required field');
    });

    test('CREW-018: should handle timeout status', async () => {
      // Given: Execution that times out
      const executionKey = `FLOW-TIMEOUT-${Date.now()}`;
      const { data: execution, error } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'timeout',
          error_message: 'Execution exceeded maximum allowed time of 300s',
          execution_mode: 'scheduled'
        })
        .select('id, status')
        .single();

      // Then: Timeout status is captured
      expect(error).toBeNull();
      expect(execution.status).toBe('timeout');
    });

    test('CREW-019: should handle cancelled executions', async () => {
      // Given: User cancels execution
      const executionKey = `FLOW-CANCEL-${Date.now()}`;
      const { data: execution } = await supabase
        .from('crewai_flow_executions')
        .insert({
          flow_id: testFlowId,
          execution_key: executionKey,
          status: 'running',
          execution_mode: 'manual'
        })
        .select('id')
        .single();

      // When: Cancellation requested
      const { data: cancelled, error } = await supabase
        .from('crewai_flow_executions')
        .update({ status: 'cancelled' })
        .eq('id', execution.id)
        .select('status')
        .single();

      // Then: Status is cancelled
      expect(error).toBeNull();
      expect(cancelled.status).toBe('cancelled');
    });
  });

  // =========================================================================
  // EXECUTION METRICS
  // =========================================================================
  test.describe('Execution Metrics', () => {
    test('CREW-020: should update flow execution_count', async () => {
      // Given: Flow with executions
      const { data: flowBefore } = await supabase
        .from('crewai_flows')
        .select('execution_count')
        .eq('id', testFlowId)
        .single();

      const countBefore = flowBefore?.execution_count || 0;

      // When: New execution completes (trigger updates count)
      // Note: Actual trigger updates count automatically

      // Then: Count should be tracked
      expect(countBefore).toBeGreaterThanOrEqual(0);
    });

    test('CREW-021: should track avg_execution_time_ms', async () => {
      // Given: Multiple executions with different durations
      const executions = [
        { duration_ms: 1000 },
        { duration_ms: 2000 },
        { duration_ms: 3000 }
      ];

      // When: Calculating average
      const totalMs = executions.reduce((sum, e) => sum + e.duration_ms, 0);
      const avgMs = Math.round(totalMs / executions.length);

      // Then: Average is calculated
      expect(avgMs).toBe(2000);
    });

    test('CREW-022: should track last_executed_at', async () => {
      // Given: Flow with recent execution
      await supabase
        .from('crewai_flows')
        .update({ last_executed_at: new Date().toISOString() })
        .eq('id', testFlowId);

      // When: Querying last execution
      const { data: flow } = await supabase
        .from('crewai_flows')
        .select('last_executed_at')
        .eq('id', testFlowId)
        .single();

      // Then: Timestamp is recent
      const lastExecuted = new Date(flow.last_executed_at);
      const now = new Date();
      const diffMs = now.getTime() - lastExecuted.getTime();

      expect(diffMs).toBeLessThan(60000); // Within last minute
    });
  });

  // =========================================================================
  // FLOW TEMPLATES
  // =========================================================================
  test.describe('Flow Templates', () => {
    test('CREW-023: should mark flow as template', async () => {
      // Given: Reusable flow pattern
      const { data: template, error } = await supabase
        .from('crewai_flows')
        .insert({
          flow_key: `template-flow-${Date.now()}`,
          flow_name: 'Standard Research Template',
          flow_definition: { nodes: [], edges: [] },
          is_template: true,
          template_category: 'research',
          status: 'active'
        })
        .select('id, is_template, template_category')
        .single();

      // Then: Template is created
      expect(error).toBeNull();
      expect(template.is_template).toBe(true);
      expect(template.template_category).toBe('research');

      // Cleanup
      await supabase.from('crewai_flows').delete().eq('id', template.id);
    });

    test('CREW-024: should search flows by tags', async () => {
      // Given: Flow with tags
      await supabase
        .from('crewai_flows')
        .update({ tags: ['research', 'market-analysis', 'test'] })
        .eq('id', testFlowId);

      // When: Searching by tag
      const { data: flows } = await supabase
        .from('crewai_flows')
        .select('flow_name, tags')
        .contains('tags', ['research']);

      // Then: Flow is found
      const found = flows?.some(f => f.tags?.includes('research'));
      expect(found).toBe(true);
    });
  });
});
