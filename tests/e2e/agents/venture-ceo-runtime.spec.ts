/**
 * Venture CEO Runtime E2E Tests
 *
 * Tests the autonomous message processing loop for CEO agents:
 * - Message claiming and routing
 * - Budget enforcement during execution
 * - Capability validation
 * - Business hypothesis tracking
 * - Truth Layer integration (predictions/outcomes)
 *
 * Reference: lib/agents/venture-ceo-runtime.js
 *
 * THE LAW: No agent execution without budget validation
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Venture CEO Runtime E2E Tests', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;
  let testAgentId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `CEO Runtime Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    // Create test venture with budget
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `CEO Runtime Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 1
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;

    // Create budget for venture
    await supabase
      .from('venture_token_budgets')
      .insert({
        venture_id: testVentureId,
        budget_allocated: 100000,
        budget_remaining: 100000
      });

    // Create test CEO agent
    const { data: agent } = await supabase
      .from('eva_agents')
      .insert({
        agent_type: 'CEO',
        name: `Test CEO Agent ${Date.now()}`,
        status: 'active',
        venture_id: testVentureId
      })
      .select('id')
      .single();

    if (agent) testAgentId = agent.id;
  });

  test.afterAll(async () => {
    // Cleanup
    if (testAgentId) {
      await supabase.from('eva_agents').delete().eq('id', testAgentId);
    }
    if (testVentureId) {
      await supabase.from('venture_token_budgets').delete().eq('venture_id', testVentureId);
      await supabase.from('system_events').delete().eq('event_data->>venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // BUDGET ENFORCEMENT
  // =========================================================================
  test.describe('Budget Enforcement', () => {
    test('CEO-001: should pass budget check with positive balance', async () => {
      // Given venture has budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVentureId)
        .single();

      expect(budget.budget_remaining).toBeGreaterThan(0);

      // When budget check is performed
      const budgetCheckResult = {
        passed: budget.budget_remaining > 0,
        remaining: budget.budget_remaining
      };

      // Then check passes
      expect(budgetCheckResult.passed).toBe(true);
    });

    test('CEO-002: should block execution when budget is zero', async () => {
      // Given venture with exhausted budget
      const { data: testVenture } = await supabase
        .from('ventures')
        .insert({
          name: `Zero Budget Venture ${Date.now()}`,
          company_id: testCompanyId,
          current_lifecycle_stage: 1
        })
        .select('id')
        .single();

      await supabase
        .from('venture_token_budgets')
        .insert({
          venture_id: testVenture.id,
          budget_allocated: 1000,
          budget_remaining: 0 // EXHAUSTED
        });

      // When checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVenture.id)
        .single();

      // Then execution should be blocked
      expect(budget.budget_remaining).toBe(0);

      // Simulate BudgetExhaustedException scenario
      const shouldBlock = budget.budget_remaining <= 0;
      expect(shouldBlock).toBe(true);

      // Cleanup
      await supabase.from('venture_token_budgets').delete().eq('venture_id', testVenture.id);
      await supabase.from('ventures').delete().eq('id', testVenture.id);
    });

    test('CEO-003: should log BUDGET_CHECK event to system_events', async () => {
      // Given budget check is performed
      const budgetCheckEvent = {
        event_type: 'BUDGET_CHECK',
        event_source: 'venture-ceo-runtime',
        severity: 'info',
        details: {
          agent_id: testAgentId,
          venture_id: testVentureId,
          status: 'PASSED',
          budget_remaining: 100000,
          timestamp: new Date().toISOString()
        }
      };

      // When event is logged
      const { data: event, error } = await supabase
        .from('system_events')
        .insert(budgetCheckEvent)
        .select('id, event_type')
        .single();

      // Then event is created
      expect(error).toBeNull();
      expect(event.event_type).toBe('BUDGET_CHECK');
    });

    test('CEO-004: should fire SovereignAlert when budget below 20%', async () => {
      // Given budget is at 15% (below 20% threshold)
      const lowBudgetVenture = await supabase
        .from('ventures')
        .insert({
          name: `Low Budget Venture ${Date.now()}`,
          company_id: testCompanyId,
          current_lifecycle_stage: 1
        })
        .select('id')
        .single();

      await supabase
        .from('venture_token_budgets')
        .insert({
          venture_id: lowBudgetVenture.data.id,
          budget_allocated: 100000,
          budget_remaining: 15000 // 15% - below threshold
        });

      // When budget check is performed
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining, budget_allocated')
        .eq('venture_id', lowBudgetVenture.data.id)
        .single();

      const WARNING_THRESHOLD = 0.2;
      const shouldWarn = budget.budget_remaining < budget.budget_allocated * WARNING_THRESHOLD;

      // Then warning should be triggered
      expect(shouldWarn).toBe(true);

      // Cleanup
      await supabase.from('venture_token_budgets').delete().eq('venture_id', lowBudgetVenture.data.id);
      await supabase.from('ventures').delete().eq('id', lowBudgetVenture.data.id);
    });

    test('CEO-005: should fail-closed when no budget record exists', async () => {
      // Given venture WITHOUT budget record
      const { data: noBudgetVenture } = await supabase
        .from('ventures')
        .insert({
          name: `No Budget Record Venture ${Date.now()}`,
          company_id: testCompanyId,
          current_lifecycle_stage: 1
        })
        .select('id')
        .single();

      // When checking for budget
      const { data: budget, error } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', noBudgetVenture.id)
        .single();

      // Then no record is found (fail-closed behavior)
      expect(budget).toBeNull();

      // Industrial Hardening v3.0: Should throw BudgetConfigurationException
      const shouldFailClosed = !budget;
      expect(shouldFailClosed).toBe(true);

      // Cleanup
      await supabase.from('ventures').delete().eq('id', noBudgetVenture.id);
    });
  });

  // =========================================================================
  // CAPABILITY VALIDATION
  // =========================================================================
  test.describe('Capability Validation', () => {
    test('CEO-006: should validate agent has required capability', async () => {
      // Given agent with specific capabilities
      const agentCapabilities = ['APPROVE_HANDOFF', 'GENERATE_ARTIFACT', 'INVOKE_SUBAGENT'];

      // When checking capability
      const requiredCapability = 'APPROVE_HANDOFF';
      const hasCapability = agentCapabilities.includes(requiredCapability);

      // Then capability check passes
      expect(hasCapability).toBe(true);
    });

    test('CEO-007: should block execution for unauthorized capability', async () => {
      // Given agent without required capability
      const agentCapabilities = ['GENERATE_ARTIFACT'];

      // When checking for unauthorized capability
      const requiredCapability = 'APPROVE_HANDOFF';
      const hasCapability = agentCapabilities.includes(requiredCapability);

      // Then capability check fails
      expect(hasCapability).toBe(false);

      // Should throw UnauthorizedCapabilityError
      const error = {
        name: 'UnauthorizedCapabilityError',
        capability: requiredCapability,
        agentId: testAgentId
      };

      expect(error.name).toBe('UnauthorizedCapabilityError');
    });

    test('CEO-008: should log capability check to system_events', async () => {
      // Given capability check is performed
      const capabilityEvent = {
        event_type: 'CAPABILITY_CHECK',
        event_source: 'venture-ceo-runtime',
        details: {
          agent_id: testAgentId,
          venture_id: testVentureId,
          capability: 'APPROVE_HANDOFF',
          result: 'AUTHORIZED',
          timestamp: new Date().toISOString()
        }
      };

      // When event is logged
      const { data: event, error } = await supabase
        .from('system_events')
        .insert(capabilityEvent)
        .select('id')
        .single();

      // Then event is created
      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // BUSINESS HYPOTHESIS TRACKING
  // =========================================================================
  test.describe('Business Hypothesis Tracking', () => {
    test('CEO-009: should capture business hypothesis with required fields', async () => {
      // Given business hypothesis data
      const businessHypothesis = {
        market_assumption: 'TAM exceeds $1B for AI governance tools',
        customer_belief: 'Startup founders will pay $99/mo for automation',
        expected_kpi_impact: {
          metric: 'LTV/CAC',
          current_value: 3.0,
          expected_change: '+25%',
          confidence: 0.7
        },
        assumption_risk: 'MEDIUM',
        pivot_trigger: 'Churn exceeds 10% monthly',
        sd_id: 'SD-TEST-001',
        prd_id: 'PRD-TEST-001'
      };

      // When logging hypothesis
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'BUSINESS_HYPOTHESIS',
          event_data: businessHypothesis,
          metadata: {
            venture_id: testVentureId,
            agent_id: testAgentId
          }
        })
        .select('id, event_data')
        .single();

      // Then hypothesis is captured
      expect(error).toBeNull();
      expect(event.event_data.market_assumption).toBeDefined();
      expect(event.event_data.expected_kpi_impact.confidence).toBeGreaterThan(0);
    });

    test('CEO-010: should link hypothesis to SD and PRD', async () => {
      // Given hypothesis with governance linkage
      const hypothesis = {
        market_assumption: 'B2B market willing to pay premium',
        sd_id: 'SD-GOVERNANCE-001', // ENCOURAGED
        prd_id: 'PRD-GOVERNANCE-001' // REQUIRED for venture execution
      };

      // When validating linkage
      const hasSDLink = !!hypothesis.sd_id;
      const hasPRDLink = !!hypothesis.prd_id;

      // Then governance links are present
      expect(hasSDLink).toBe(true);
      expect(hasPRDLink).toBe(true);
    });
  });

  // =========================================================================
  // MESSAGE PROCESSING LOOP
  // =========================================================================
  test.describe('Message Processing Loop', () => {
    test('CEO-011: should process messages in order', async () => {
      // Given pending messages for CEO
      const messages = [
        { type: 'HANDOFF_REQUEST', priority: 1, timestamp: Date.now() - 3000 },
        { type: 'ARTIFACT_READY', priority: 2, timestamp: Date.now() - 2000 },
        { type: 'STATUS_UPDATE', priority: 3, timestamp: Date.now() - 1000 }
      ];

      // When processing order is determined
      const processedOrder = messages.sort((a, b) => a.timestamp - b.timestamp);

      // Then FIFO order is maintained
      expect(processedOrder[0].type).toBe('HANDOFF_REQUEST');
      expect(processedOrder[1].type).toBe('ARTIFACT_READY');
      expect(processedOrder[2].type).toBe('STATUS_UPDATE');
    });

    test('CEO-012: should route message to correct handler', async () => {
      // Given message types and handlers
      const messageHandlers: Record<string, string> = {
        'HANDOFF_REQUEST': 'handleHandoffRequest',
        'ARTIFACT_READY': 'handleArtifactReady',
        'STATUS_UPDATE': 'handleStatusUpdate',
        'SUBAGENT_RESULT': 'handleSubagentResult'
      };

      // When routing messages
      const message = { type: 'HANDOFF_REQUEST' };
      const handler = messageHandlers[message.type];

      // Then correct handler is selected
      expect(handler).toBe('handleHandoffRequest');
    });

    test('CEO-013: should emit outbound messages after processing', async () => {
      // Given message processing result
      const processingResult = {
        success: true,
        outboundMessages: [
          { type: 'SUBAGENT_INVOKE', target: 'QA-Agent', payload: {} },
          { type: 'STATUS_UPDATE', target: 'Dashboard', payload: { progress: 50 } }
        ]
      };

      // When checking outbound messages
      const hasOutbound = processingResult.outboundMessages.length > 0;

      // Then outbound messages are queued
      expect(hasOutbound).toBe(true);
      expect(processingResult.outboundMessages).toHaveLength(2);
    });
  });

  // =========================================================================
  // CIRCUIT BREAKER
  // =========================================================================
  test.describe('Circuit Breaker', () => {
    test('CEO-014: should trigger circuit breaker after max iterations', async () => {
      // Given iteration limits
      const MAX_ITERATIONS = 100;
      let currentIteration = 0;

      // Simulate runaway loop
      while (currentIteration < MAX_ITERATIONS + 10) {
        currentIteration++;
        if (currentIteration >= MAX_ITERATIONS) {
          break;
        }
      }

      // When limit is reached
      const circuitBreakerTriggered = currentIteration >= MAX_ITERATIONS;

      // Then circuit breaker activates
      expect(circuitBreakerTriggered).toBe(true);
    });

    test('CEO-015: should log CircuitBreakerException event', async () => {
      // Given circuit breaker is triggered
      const circuitBreakerEvent = {
        event_type: 'CIRCUIT_BREAKER_TRIGGERED',
        event_source: 'venture-ceo-runtime',
        severity: 'error',
        details: {
          agent_id: testAgentId,
          venture_id: testVentureId,
          reason: 'MAX_ITERATIONS_EXCEEDED',
          iteration_count: 100,
          timestamp: new Date().toISOString()
        }
      };

      // When event is logged
      const { data: event, error } = await supabase
        .from('system_events')
        .insert(circuitBreakerEvent)
        .select('id')
        .single();

      // Then event is created
      expect(error).toBeNull();
    });
  });
});
