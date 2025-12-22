/**
 * E2E Tests: Context7 Failure Scenarios
 * SD-KNOWLEDGE-001: User Story US-004 Circuit Breaker Resilience
 *
 * Scenarios Covered:
 * - US-004: Circuit breaker opens after 3 failures
 * - SCENARIO-006: Circuit breaker auto-recovery after 1 hour
 * - SCENARIO-007: Token budget enforcement (15k hard cap)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test.describe('Context7 Failure Scenarios', () => {
  test.beforeEach(async () => {
    // Reset circuit breaker to known state
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'closed',
        failure_count: 0,
        last_failure_at: null,
        last_success_at: null
      })
      .eq('service_name', 'context7');
  });

  test('US-004: Circuit breaker opens after 3 consecutive failures', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Record 3 failures
    for (let i = 0; i < 3; i++) {
      await execAsync('node scripts/context7-circuit-breaker.js failure');
    }

    // Check circuit state
    const { stdout: statusOutput } = await execAsync(
      'node scripts/context7-circuit-breaker.js status'
    );

    expect(statusOutput).toContain('State: open');
    expect(statusOutput).toContain('Failures: 3/3');

    // Verify requests are blocked
    const { stdout: allowOutput } = await execAsync(
      'node scripts/context7-circuit-breaker.js allow'
    );

    expect(allowOutput).toContain('Request blocked');
  });

  test('SCENARIO-006: Circuit breaker auto-recovers after 1 hour', async () => {
    // Set circuit to OPEN state with old failure timestamp (>1 hour ago)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 2); // 2 hours ago to be sure

    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'open',
        failure_count: 3,
        last_failure_at: oneHourAgo.toISOString()
      })
      .eq('service_name', 'context7');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Check if requests allowed (should transition to HALF_OPEN)
    const { stdout } = await execAsync(
      'node scripts/context7-circuit-breaker.js allow'
    );

    expect(stdout).toContain('Request allowed');

    // Verify state transitioned to HALF_OPEN
    const { data: state } = await supabase
      .from('system_health')
      .select('circuit_breaker_state')
      .eq('service_name', 'context7')
      .single();

    expect(state?.circuit_breaker_state).toBe('half-open');

    // Record success to complete recovery
    await execAsync('node scripts/context7-circuit-breaker.js success');

    // Verify state is now CLOSED
    const { data: finalState } = await supabase
      .from('system_health')
      .select('circuit_breaker_state, failure_count')
      .eq('service_name', 'context7')
      .single();

    expect(finalState?.circuit_breaker_state).toBe('closed');
    expect(finalState?.failure_count).toBe(0);
  });

  test('US-004: HALF_OPEN → OPEN on failed recovery test', async () => {
    // Set to HALF_OPEN state
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'half-open',
        failure_count: 3
      })
      .eq('service_name', 'context7');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Record failure during recovery test
    await execAsync('node scripts/context7-circuit-breaker.js failure');

    // Verify circuit reopened
    const { data: state } = await supabase
      .from('system_health')
      .select('circuit_breaker_state')
      .eq('service_name', 'context7')
      .single();

    expect(state?.circuit_breaker_state).toBe('open');
  });

  test('US-004: HALF_OPEN → CLOSED on successful recovery test', async () => {
    // Set to HALF_OPEN state
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'half-open',
        failure_count: 3
      })
      .eq('service_name', 'context7');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Record success during recovery test
    await execAsync('node scripts/context7-circuit-breaker.js success');

    // Verify circuit closed
    const { data: state } = await supabase
      .from('system_health')
      .select('circuit_breaker_state, failure_count')
      .eq('service_name', 'context7')
      .single();

    expect(state?.circuit_breaker_state).toBe('closed');
    expect(state?.failure_count).toBe(0);
  });

  test('Circuit breaker state persistence', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Record failure
    await execAsync('node scripts/context7-circuit-breaker.js failure');

    // Get state
    const { stdout: status1 } = await execAsync(
      'node scripts/context7-circuit-breaker.js status'
    );

    expect(status1).toContain('Failures: 1/3');

    // Record another failure
    await execAsync('node scripts/context7-circuit-breaker.js failure');

    // Verify count persisted and incremented
    const { stdout: status2 } = await execAsync(
      'node scripts/context7-circuit-breaker.js status'
    );

    expect(status2).toContain('Failures: 2/3');
  });

  test('SCENARIO-007: Token budget enforcement (mock)', async () => {
    // This is a unit-level test, but included for completeness
    // Actual token budget is enforced in automated-knowledge-retrieval.js

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Run research query
    const { stdout } = await execAsync(
      'node scripts/automated-knowledge-retrieval.js SD-KNOWLEDGE-001 "TestTech"'
    );

    // Verify token tracking is present
    expect(stdout).toContain('Tokens consumed');

    // Check audit log for token tracking
    const { data: auditLogs } = await supabase
      .from('prd_research_audit_log')
      .select('tokens_consumed')
      .eq('sd_id', 'SD-KNOWLEDGE-001')
      .order('created_at', { ascending: false })
      .limit(1);

    if (auditLogs && auditLogs.length > 0) {
      expect(auditLogs[0].tokens_consumed).toBeGreaterThanOrEqual(0);
      expect(auditLogs[0].tokens_consumed).toBeLessThanOrEqual(5000); // Per-query budget
    }
  });

  test('Circuit breaker reset functionality', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Set to failed state
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'open',
        failure_count: 3
      })
      .eq('service_name', 'context7');

    // Reset
    await execAsync('node scripts/context7-circuit-breaker.js reset');

    // Verify reset
    const { data: state } = await supabase
      .from('system_health')
      .select('circuit_breaker_state, failure_count')
      .eq('service_name', 'context7')
      .single();

    expect(state?.circuit_breaker_state).toBe('closed');
    expect(state?.failure_count).toBe(0);
  });

  test('Multiple service support (extensibility)', async () => {
    // Verify system can track multiple services
    // (Currently only Context7, but designed for extensibility)

    const { data: services } = await supabase
      .from('system_health')
      .select('service_name, circuit_breaker_state');

    expect(services).toBeDefined();
    expect(services!.length).toBeGreaterThanOrEqual(1);

    const context7Service = services!.find(s => s.service_name === 'context7');
    expect(context7Service).toBeDefined();
    expect(['open', 'half-open', 'closed']).toContain(context7Service!.circuit_breaker_state);
  });

  test.afterAll(async () => {
    // Cleanup: Reset to healthy state
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'closed',
        failure_count: 0,
        last_failure_at: null,
        last_success_at: new Date().toISOString()
      })
      .eq('service_name', 'context7');
  });
});
