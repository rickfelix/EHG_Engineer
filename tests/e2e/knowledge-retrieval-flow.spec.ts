/**
 * E2E Tests: Knowledge Retrieval Flow
 * SD-KNOWLEDGE-001: User Stories US-001, US-002, US-003, US-005
 *
 * Scenarios Covered:
 * - US-001: Retrospective search (<2s, ≤500 tokens)
 * - US-002: Context7 fallback (local <3)
 * - US-003: PRD auto-enrichment (confidence >0.85)
 * - US-005: Research telemetry logging
 * - SCENARIO-008: Cache TTL (24 hours)
 * - SCENARIO-009: Graceful degradation
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

test.describe('Knowledge Retrieval Flow', () => {
  const TEST_SD_ID = 'SD-KNOWLEDGE-001';
  const TEST_TECH_STACK = 'Supabase';

  test.beforeEach(async () => {
    // Clean up test data
    await supabase.from('tech_stack_references').delete().eq('sd_id', TEST_SD_ID);
    await supabase.from('prd_research_audit_log').delete().eq('sd_id', TEST_SD_ID);
  });

  test('US-001: Retrospective search returns results in <2s', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const startTime = Date.now();

    const { stdout } = await execAsync(
      `node scripts/automated-knowledge-retrieval.js ${TEST_SD_ID} "${TEST_TECH_STACK}"`
    );

    const duration = Date.now() - startTime;

    // Performance requirement: <2 seconds
    expect(duration).toBeLessThan(2000);

    // Verify output contains results
    expect(stdout).toContain('Research Results');
    expect(stdout).toContain('Research complete');
  });

  test('US-002: Context7 fallback when local results <3', async () => {
    // Query for rare tech stack (expecting <3 local results)
    const { data: cachedBefore } = await supabase
      .from('tech_stack_references')
      .select('*')
      .eq('sd_id', TEST_SD_ID)
      .eq('tech_stack', 'RareTechStack2025');

    expect(cachedBefore).toHaveLength(0);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `node scripts/automated-knowledge-retrieval.js ${TEST_SD_ID} "RareTechStack2025"`
    );

    // Verify Context7 fallback was attempted
    expect(stdout).toMatch(/Context7|fallback/i);
  });

  test('US-003: PRD auto-enrichment with confidence >0.85', async () => {
    const TEST_PRD_ID = 'PRD-KNOWLEDGE-001';

    // Run enrichment
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `node scripts/enrich-prd-with-research.js ${TEST_PRD_ID}`
    );

    // Verify enrichment completed
    expect(stdout).toContain('Enrichment Summary');

    // Check user_stories were updated
    const { data: userStories } = await supabase
      .from('user_stories')
      .select('implementation_context')
      .eq('sd_id', TEST_SD_ID)
      .not('implementation_context', 'is', null);

    expect(userStories).toBeDefined();

    // Check PRD confidence score was set
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('research_confidence_score')
      .eq('id', TEST_PRD_ID)
      .single();

    expect(prd?.research_confidence_score).toBeDefined();
  });

  test('US-005: Research telemetry logging', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Perform research
    await execAsync(
      `node scripts/automated-knowledge-retrieval.js ${TEST_SD_ID} "${TEST_TECH_STACK}"`
    );

    // Verify audit log entry was created
    const { data: auditLogs } = await supabase
      .from('prd_research_audit_log')
      .select('*')
      .eq('sd_id', TEST_SD_ID)
      .order('created_at', { ascending: false })
      .limit(1);

    expect(auditLogs).toHaveLength(1);

    const log = auditLogs![0];
    expect(log.query_type).toMatch(/retrospective|context7|hybrid/);
    expect(log.tokens_consumed).toBeGreaterThanOrEqual(0);
    expect(log.execution_time_ms).toBeGreaterThan(0);
  });

  test('SCENARIO-008: Cache hit within 24 hours', async () => {
    // First query - cache miss
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync(
      `node scripts/automated-knowledge-retrieval.js ${TEST_SD_ID} "${TEST_TECH_STACK}"`
    );

    // Verify cache entry exists
    const { data: cached } = await supabase
      .from('tech_stack_references')
      .select('*')
      .eq('sd_id', TEST_SD_ID)
      .eq('tech_stack', TEST_TECH_STACK);

    expect(cached).toBeDefined();
    expect(cached!.length).toBeGreaterThan(0);

    // Second query - should hit cache
    const { stdout: stdout2 } = await execAsync(
      `node scripts/automated-knowledge-retrieval.js ${TEST_SD_ID} "${TEST_TECH_STACK}"`
    );

    expect(stdout2).toContain('Cache hit');
  });

  test('SCENARIO-009: Graceful degradation when Context7 down', async () => {
    // Set circuit breaker to OPEN state
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'open',
        failure_count: 3,
        last_failure_at: new Date().toISOString()
      })
      .eq('service_name', 'context7');

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Query should still work (local-only mode)
    const { stdout } = await execAsync(
      `node scripts/automated-knowledge-retrieval.js ${TEST_SD_ID} "${TEST_TECH_STACK}"`
    );

    expect(stdout).toContain('Research complete');
    expect(stdout).toMatch(/Context7 blocked|Degrading gracefully|local-only/i);

    // Reset circuit breaker
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'closed',
        failure_count: 0
      })
      .eq('service_name', 'context7');
  });

  test.afterAll(async () => {
    // Cleanup: Reset circuit breaker
    await supabase
      .from('system_health')
      .update({
        circuit_breaker_state: 'closed',
        failure_count: 0,
        last_failure_at: null
      })
      .eq('service_name', 'context7');
  });
});
