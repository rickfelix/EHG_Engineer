/**
 * Fixture for clock-skew-reapplication.spawn.test.js (SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001, FR-1).
 *
 * Reproduces the exact G1/G2 pattern the disposable measurement harness used to find the real
 * blind-guard mechanism: G1 (or its cleanup) calls vi.useRealTimers(), and G2 — the next test in
 * the SAME file — must still see the skew if tests/setup.clock-skew.js's per-test reapplication
 * is working. Before that fix, G2 read the real (unskewed) clock while the job still reported
 * green.
 *
 * Harmless in the normal (unskewed) unit tier: with TEST_CLOCK_OFFSET_MS unset, the setup hook
 * no-ops and these are two trivial, always-passing tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('clock-skew fixture (G1/G2)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('G1 — runs under the skewed clock, then afterEach resets to real timers', () => {
    expect(true).toBe(true);
  });

  it('G2 — sibling test, must still observe the skew after G1 reset timers', () => {
    expect(true).toBe(true);
  });
});
