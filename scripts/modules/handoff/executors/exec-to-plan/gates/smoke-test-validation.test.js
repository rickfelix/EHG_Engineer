/**
 * Tests for SMOKE_TEST_VALIDATION's SD-smoke-steps fallback query
 * (SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-2).
 */
import { describe, it, expect } from 'vitest';
import { createSmokeTestValidationGate } from './smoke-test-validation.js';
import { createQueuedSupabaseMock } from '../../../../../../tests/factories/queued-supabase-mock.js';

const ctx = (overrides = {}) => ({
  sd: { id: 'sd-1', sd_type: 'feature', smoke_test_steps: [], ...overrides },
});

describe('SMOKE_TEST_VALIDATION sd-smoke-steps fallback', () => {
  it('uses the SD smoke_test_steps fallback when the query succeeds', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: { test_scenarios: [], exec_checklist: [] }, error: null }, // PRD lookup
      { data: { smoke_test_steps: [{ step: 1 }, { step: 2 }] }, error: null }, // SD lookup
    ]);
    const gate = createSmokeTestValidationGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(true);
    expect(result.details.source).toBe('sd_smoke_test_steps');
  });

  it('FR-2: fails closed (passed:false) when the SD-lookup query is broken', async () => {
    const supabase = createQueuedSupabaseMock([
      { data: { test_scenarios: [], exec_checklist: [] }, error: null }, // PRD lookup
      { data: null, error: { message: 'relation does not exist', code: '42P01' } }, // SD lookup fails
    ]);
    const gate = createSmokeTestValidationGate(supabase);

    const result = await gate.validator(ctx());

    expect(result.passed).toBe(false);
  });
});
