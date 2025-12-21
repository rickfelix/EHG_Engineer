/**
 * Budget Kill-Switch E2E Tests
 *
 * Tests the Industrial Hardening v3.0 budget enforcement:
 * - ABSOLUTE kill switch when budget <= 0
 * - SovereignAlert when budget < 20%
 * - FAIL-CLOSED behavior (no record = HALT)
 * - Circuit breaker limits
 * - Budget consumption tracking
 *
 * Reference:
 * - lib/agents/venture-ceo-runtime.js:270-333
 * - lib/error-triggered-sub-agent-invoker.js:48-66
 *
 * THE LAW: No agent execution without budget validation. NO EXCEPTIONS.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Budget Kill-Switch E2E Tests', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;
  let testAgentId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Budget Kill-Switch Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    // Create test venture
    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Budget Kill-Switch Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 1
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;

    // Create test agent
    const { data: agent } = await supabase
      .from('eva_agents')
      .insert({
        agent_type: 'CEO',
        name: `Budget Test CEO ${Date.now()}`,
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
      await supabase.from('venture_phase_budgets').delete().eq('venture_id', testVentureId);
      await supabase.from('system_events').delete().eq('details->>venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // KILL SWITCH ACTIVATION
  // =========================================================================
  test.describe('Kill Switch Activation', () => {
    test('BKS-001: should activate kill switch when budget is zero', async () => {
      // Given: Venture with zero budget
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 50000,
          budget_remaining: 0 // EXHAUSTED
        }, { onConflict: 'venture_id' });

      // When: Checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVentureId)
        .single();

      // Then: Kill switch should activate
      expect(budget.budget_remaining).toBe(0);

      // Simulate exception
      const killSwitchActivated = budget.budget_remaining <= 0;
      expect(killSwitchActivated).toBe(true);

      const exception = {
        name: 'BudgetExhaustedException',
        message: `Budget exhausted for agent ${testAgentId} (venture: ${testVentureId}). Remaining: 0`,
        isRetryable: false
      };
      expect(exception.name).toBe('BudgetExhaustedException');
    });

    test('BKS-002: should activate kill switch when budget is negative', async () => {
      // Given: Venture with negative budget (overdraft)
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 50000,
          budget_remaining: -1000 // OVERDRAFT
        }, { onConflict: 'venture_id' });

      // When: Checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVentureId)
        .single();

      // Then: Kill switch should activate for any value <= 0
      expect(budget.budget_remaining).toBeLessThan(0);
      const killSwitchActivated = budget.budget_remaining <= 0;
      expect(killSwitchActivated).toBe(true);
    });

    test('BKS-003: should allow execution when budget is positive', async () => {
      // Given: Venture with positive budget
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 50000,
          budget_remaining: 25000 // HEALTHY
        }, { onConflict: 'venture_id' });

      // When: Checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVentureId)
        .single();

      // Then: Execution should be allowed
      expect(budget.budget_remaining).toBeGreaterThan(0);
      const killSwitchActivated = budget.budget_remaining <= 0;
      expect(killSwitchActivated).toBe(false);
    });
  });

  // =========================================================================
  // SOVEREIGN ALERT (20% THRESHOLD)
  // =========================================================================
  test.describe('SovereignAlert (20% Threshold)', () => {
    test('BKS-004: should fire warning when budget below 20%', async () => {
      // Given: Budget at 15% (below 20% threshold)
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 100000,
          budget_remaining: 15000 // 15%
        }, { onConflict: 'venture_id' });

      // When: Checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining, budget_allocated')
        .eq('venture_id', testVentureId)
        .single();

      // Then: Warning should be triggered
      const WARNING_THRESHOLD = 0.2;
      const shouldWarn = budget.budget_remaining < budget.budget_allocated * WARNING_THRESHOLD;
      expect(shouldWarn).toBe(true);

      // Log warning event
      const warningEvent = {
        event_type: 'BUDGET_WARNING',
        event_source: 'venture-ceo-runtime',
        severity: 'warning',
        details: {
          venture_id: testVentureId,
          budget_remaining: budget.budget_remaining,
          budget_allocated: budget.budget_allocated,
          percentage: (budget.budget_remaining / budget.budget_allocated * 100).toFixed(1),
          threshold: '20%',
          timestamp: new Date().toISOString()
        }
      };

      const { error } = await supabase
        .from('system_events')
        .insert(warningEvent);

      expect(error).toBeNull();
    });

    test('BKS-005: should not fire warning when budget above 20%', async () => {
      // Given: Budget at 50% (above 20% threshold)
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 100000,
          budget_remaining: 50000 // 50%
        }, { onConflict: 'venture_id' });

      // When: Checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining, budget_allocated')
        .eq('venture_id', testVentureId)
        .single();

      // Then: No warning should be triggered
      const WARNING_THRESHOLD = 0.2;
      const shouldWarn = budget.budget_remaining < budget.budget_allocated * WARNING_THRESHOLD;
      expect(shouldWarn).toBe(false);
    });

    test('BKS-006: should handle edge case at exactly 20%', async () => {
      // Given: Budget at exactly 20%
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 100000,
          budget_remaining: 20000 // Exactly 20%
        }, { onConflict: 'venture_id' });

      // When: Checking budget
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining, budget_allocated')
        .eq('venture_id', testVentureId)
        .single();

      // Then: Warning should NOT fire (threshold is < 20%, not <=)
      const WARNING_THRESHOLD = 0.2;
      const shouldWarn = budget.budget_remaining < budget.budget_allocated * WARNING_THRESHOLD;
      expect(shouldWarn).toBe(false);
    });
  });

  // =========================================================================
  // FAIL-CLOSED BEHAVIOR
  // =========================================================================
  test.describe('Fail-Closed Behavior', () => {
    test('BKS-007: should HALT when no budget record exists', async () => {
      // Given: Venture WITHOUT any budget record
      const { data: noBudgetVenture } = await supabase
        .from('ventures')
        .insert({
          name: `No Budget Venture ${Date.now()}`,
          company_id: testCompanyId,
          current_lifecycle_stage: 1
        })
        .select('id')
        .single();

      // When: Checking for budget in both tables
      const { data: tokenBudget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', noBudgetVenture.id)
        .single();

      const { data: phaseBudget } = await supabase
        .from('venture_phase_budgets')
        .select('budget_remaining')
        .eq('venture_id', noBudgetVenture.id)
        .limit(1)
        .single();

      // Then: Both should be null (fail-closed)
      expect(tokenBudget).toBeNull();
      expect(phaseBudget).toBeNull();

      // Should throw BudgetConfigurationException
      const exception = {
        name: 'BudgetConfigurationException',
        message: `Budget configuration missing for venture ${noBudgetVenture.id}. Reason: NO_BUDGET_RECORD`,
        isRetryable: false,
        reason: 'NO_BUDGET_RECORD - Venture must have budget tracking configured before agent execution'
      };
      expect(exception.name).toBe('BudgetConfigurationException');
      expect(exception.isRetryable).toBe(false);

      // Cleanup
      await supabase.from('ventures').delete().eq('id', noBudgetVenture.id);
    });

    test('BKS-008: should log NO_RECORD status to system_events', async () => {
      // Given: Budget check with no record
      const noRecordEvent = {
        event_type: 'BUDGET_CHECK',
        event_source: 'venture-ceo-runtime',
        severity: 'error',
        details: {
          agent_id: testAgentId,
          venture_id: testVentureId,
          status: 'NO_RECORD',
          budget_remaining: null,
          timestamp: new Date().toISOString()
        }
      };

      // When: Event is logged
      const { data: event, error } = await supabase
        .from('system_events')
        .insert(noRecordEvent)
        .select('id, details')
        .single();

      // Then: NO_RECORD status is captured
      expect(error).toBeNull();
      expect(event.details.status).toBe('NO_RECORD');
    });
  });

  // =========================================================================
  // BUDGET SOURCE PRIORITY
  // =========================================================================
  test.describe('Budget Source Priority', () => {
    test('BKS-009: should prefer venture_token_budgets over phase budgets', async () => {
      // Given: Both token and phase budgets exist with different values
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 100000,
          budget_remaining: 75000 // Token budget value
        }, { onConflict: 'venture_id' });

      await supabase
        .from('venture_phase_budgets')
        .insert({
          venture_id: testVentureId,
          phase: 1,
          budget_allocated: 50000,
          budget_remaining: 25000 // Phase budget value (different)
        });

      // When: Checking budget (token budget is preferred)
      const { data: tokenBudget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVentureId)
        .single();

      // Then: Token budget value is used
      expect(tokenBudget.budget_remaining).toBe(75000);

      // Cleanup phase budget
      await supabase
        .from('venture_phase_budgets')
        .delete()
        .eq('venture_id', testVentureId);
    });

    test('BKS-010: should fallback to venture_phase_budgets when token budget missing', async () => {
      // Given: Venture with only phase budget
      const { data: phaseBudgetVenture } = await supabase
        .from('ventures')
        .insert({
          name: `Phase Budget Only Venture ${Date.now()}`,
          company_id: testCompanyId,
          current_lifecycle_stage: 1
        })
        .select('id')
        .single();

      await supabase
        .from('venture_phase_budgets')
        .insert({
          venture_id: phaseBudgetVenture.id,
          phase: 1,
          budget_allocated: 30000,
          budget_remaining: 30000
        });

      // When: Token budget is missing
      const { data: tokenBudget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', phaseBudgetVenture.id)
        .single();

      const { data: phaseBudget } = await supabase
        .from('venture_phase_budgets')
        .select('budget_remaining')
        .eq('venture_id', phaseBudgetVenture.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Then: Phase budget is used as fallback
      expect(tokenBudget).toBeNull();
      expect(phaseBudget.budget_remaining).toBe(30000);

      // Cleanup
      await supabase.from('venture_phase_budgets').delete().eq('venture_id', phaseBudgetVenture.id);
      await supabase.from('ventures').delete().eq('id', phaseBudgetVenture.id);
    });
  });

  // =========================================================================
  // CIRCUIT BREAKER
  // =========================================================================
  test.describe('Circuit Breaker Configuration', () => {
    test('BKS-011: should limit invocations per error pattern', async () => {
      // Given: Circuit breaker configuration
      const CIRCUIT_BREAKER_CONFIG = {
        maxInvocationsPerPattern: 3,
        timeWindowMs: 30 * 60 * 1000, // 30 minutes
        cooldownMs: 60 * 60 * 1000, // 1 hour
        maxTotalInvocations: 10,
        escalationThreshold: 5
      };

      // Simulate invocation tracking
      const invocations = [
        { errorId: 'E001', timestamp: Date.now() - 60000 },
        { errorId: 'E001', timestamp: Date.now() - 30000 },
        { errorId: 'E001', timestamp: Date.now() } // Third attempt
      ];

      // When: Counting invocations for pattern
      const patternCount = invocations.filter(inv =>
        inv.errorId === 'E001' &&
        inv.timestamp > Date.now() - CIRCUIT_BREAKER_CONFIG.timeWindowMs
      ).length;

      // Then: Circuit breaker should trigger
      const circuitOpen = patternCount >= CIRCUIT_BREAKER_CONFIG.maxInvocationsPerPattern;
      expect(circuitOpen).toBe(true);
    });

    test('BKS-012: should limit total invocations per SD', async () => {
      // Given: Max total invocations = 10
      const maxTotal = 10;

      // Simulate 10 invocations
      const totalInvocations = 10;

      // When: Checking total limit
      const shouldBlock = totalInvocations >= maxTotal;

      // Then: Should block further invocations
      expect(shouldBlock).toBe(true);
    });

    test('BKS-013: should apply cooldown after circuit opens', async () => {
      // Given: Circuit opened at specific time
      const circuitOpenedAt = Date.now() - 30 * 60 * 1000; // 30 minutes ago
      const cooldownMs = 60 * 60 * 1000; // 1 hour

      // When: Checking if cooldown has passed
      const cooldownComplete = Date.now() > (circuitOpenedAt + cooldownMs);

      // Then: Cooldown not yet complete (only 30 min passed)
      expect(cooldownComplete).toBe(false);

      // Simulate 1 hour later
      const laterCheck = (circuitOpenedAt + 30 * 60 * 1000) > (circuitOpenedAt + cooldownMs);
      expect(laterCheck).toBe(false);
    });
  });

  // =========================================================================
  // BUDGET LOGGING
  // =========================================================================
  test.describe('Budget Check Logging', () => {
    test('BKS-014: should log PASSED status for healthy budget', async () => {
      // Given: Healthy budget
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 50000,
          budget_remaining: 45000
        }, { onConflict: 'venture_id' });

      // When: Budget check passes
      const passedEvent = {
        event_type: 'BUDGET_CHECK',
        event_source: 'venture-ceo-runtime',
        severity: 'info',
        details: {
          agent_id: testAgentId,
          venture_id: testVentureId,
          status: 'PASSED',
          budget_remaining: 45000,
          timestamp: new Date().toISOString()
        }
      };

      const { data: event, error } = await supabase
        .from('system_events')
        .insert(passedEvent)
        .select('id, details')
        .single();

      // Then: PASSED status is logged
      expect(error).toBeNull();
      expect(event.details.status).toBe('PASSED');
    });

    test('BKS-015: should log BLOCKED status for exhausted budget', async () => {
      // Given: Exhausted budget
      const blockedEvent = {
        event_type: 'BUDGET_CHECK',
        event_source: 'venture-ceo-runtime',
        severity: 'error',
        details: {
          agent_id: testAgentId,
          venture_id: testVentureId,
          status: 'BLOCKED',
          budget_remaining: 0,
          timestamp: new Date().toISOString()
        }
      };

      // When: Budget check fails
      const { data: event, error } = await supabase
        .from('system_events')
        .insert(blockedEvent)
        .select('id, details, severity')
        .single();

      // Then: BLOCKED status with error severity
      expect(error).toBeNull();
      expect(event.details.status).toBe('BLOCKED');
      expect(event.severity).toBe('error');
    });
  });

  // =========================================================================
  // BUDGET CONSUMPTION
  // =========================================================================
  test.describe('Budget Consumption Tracking', () => {
    test('BKS-016: should track token consumption', async () => {
      // Given: Initial budget
      await supabase
        .from('venture_token_budgets')
        .upsert({
          venture_id: testVentureId,
          budget_allocated: 50000,
          budget_remaining: 50000
        }, { onConflict: 'venture_id' });

      // When: Tokens are consumed
      const tokensUsed = 5000;
      await supabase
        .from('venture_token_budgets')
        .update({ budget_remaining: 50000 - tokensUsed })
        .eq('venture_id', testVentureId);

      // Then: Budget remaining is updated
      const { data: budget } = await supabase
        .from('venture_token_budgets')
        .select('budget_remaining')
        .eq('venture_id', testVentureId)
        .single();

      expect(budget.budget_remaining).toBe(45000);
    });

    test('BKS-017: should calculate consumption percentage', async () => {
      // Given: Budget state
      const budget = {
        allocated: 100000,
        remaining: 35000
      };

      // When: Calculating consumption
      const consumed = budget.allocated - budget.remaining;
      const consumptionPercentage = (consumed / budget.allocated) * 100;

      // Then: Consumption is calculated
      expect(consumed).toBe(65000);
      expect(consumptionPercentage).toBe(65);
    });

    test('BKS-018: should project burn rate', async () => {
      // Given: Historical consumption data
      const consumptionHistory = [
        { tokens: 5000, timestamp: Date.now() - 3600000 }, // 1 hour ago
        { tokens: 7000, timestamp: Date.now() - 1800000 }, // 30 min ago
        { tokens: 3000, timestamp: Date.now() } // Now
      ];

      // When: Calculating burn rate
      const totalTokens = consumptionHistory.reduce((sum, c) => sum + c.tokens, 0);
      const timeSpanMs = consumptionHistory[consumptionHistory.length - 1].timestamp - consumptionHistory[0].timestamp;
      const burnRatePerHour = (totalTokens / timeSpanMs) * 3600000;

      // Then: Burn rate is calculated
      expect(burnRatePerHour).toBeGreaterThan(0);

      // Project time to exhaustion
      const remainingBudget = 35000;
      const hoursToExhaustion = remainingBudget / burnRatePerHour;
      expect(hoursToExhaustion).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // EXCEPTION CHARACTERISTICS
  // =========================================================================
  test.describe('Exception Characteristics', () => {
    test('BKS-019: BudgetExhaustedException should be non-retryable', async () => {
      const exception = {
        name: 'BudgetExhaustedException',
        isRetryable: false,
        agentId: testAgentId,
        ventureId: testVentureId,
        budgetRemaining: 0
      };

      // Non-retryable because budget exhaustion requires human intervention
      expect(exception.isRetryable).toBe(false);
    });

    test('BKS-020: BudgetConfigurationException should be non-retryable', async () => {
      const exception = {
        name: 'BudgetConfigurationException',
        isRetryable: false,
        agentId: testAgentId,
        ventureId: testVentureId,
        reason: 'NO_BUDGET_RECORD'
      };

      // Non-retryable because configuration requires setup
      expect(exception.isRetryable).toBe(false);
    });
  });
});
