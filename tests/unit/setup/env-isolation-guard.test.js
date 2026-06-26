/**
 * SD-LEO-INFRA-UNIT-TEST-ISOLATION-POLLUTION-001 FR-1
 * Proves the setup.unit.js per-test process.env snapshot/restore: a test that mutates process.env
 * must NOT leak into the next test. This is the mechanism that stops cross-file env pollution under
 * pool:'forks' (the run-to-run-varying failing set this SD fixes).
 */
import { describe, it, expect, vi } from 'vitest';

describe('FR-1 env isolation guard (per-test process.env reset)', () => {
  it('case A mutates process.env (direct + vi.stubEnv)', () => {
    process.env.__LEAK_PROBE_DIRECT__ = 'leaked';
    vi.stubEnv('__LEAK_PROBE_STUB__', 'stubbed');
    expect(process.env.__LEAK_PROBE_DIRECT__).toBe('leaked');
    expect(process.env.__LEAK_PROBE_STUB__).toBe('stubbed');
  });

  it('case B must see NEITHER probe — env was restored after case A', () => {
    expect(process.env.__LEAK_PROBE_DIRECT__).toBeUndefined();
    expect(process.env.__LEAK_PROBE_STUB__).toBeUndefined();
  });

  it('the synthetic test.invalid default survives the per-test restore', () => {
    expect(process.env.SUPABASE_URL).toBe('https://test.invalid.local');
  });

  it('a DELETED env key is restored for the next test', () => {
    // SUPABASE_URL exists (synthetic default). Delete it here; the afterEach must put it back,
    // which the previous test already proved — assert the delete worked within this test.
    delete process.env.SUPABASE_URL;
    expect(process.env.SUPABASE_URL).toBeUndefined();
  });

  it('SUPABASE_URL is back after the delete in the prior test (restore on delete)', () => {
    expect(process.env.SUPABASE_URL).toBe('https://test.invalid.local');
  });
});
