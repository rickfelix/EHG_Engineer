/**
 * SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001
 * Pins the schema-reference lint exit decision: a degraded --diff run (unresolvable
 * base -> whole-repo fallback) is ADVISORY (exit 0) regardless of violation count,
 * while a resolvable-base run keeps full diff-scoped blocking (exit 1 on violations).
 */
import { describe, it, expect } from 'vitest';
import { computeExitCode } from '../../scripts/lint/schema-lint-exit.mjs';

describe('computeExitCode — schema-reference lint exit decision', () => {
  it('degraded run with the pre-existing backlog exits 0 (advisory, non-blocking)', () => {
    expect(computeExitCode({ violations: 601, degradedFallback: true })).toBe(0);
  });

  it('degraded run with zero violations also exits 0', () => {
    expect(computeExitCode({ violations: 0, degradedFallback: true })).toBe(0);
  });

  it('resolvable-base run with genuine NEW drift exits 1 (blocking preserved)', () => {
    expect(computeExitCode({ violations: 1, degradedFallback: false })).toBe(1);
  });

  it('clean run (no violations, not degraded) exits 0', () => {
    expect(computeExitCode({ violations: 0, degradedFallback: false })).toBe(0);
  });

  it('defaults to 0 when called with no arguments', () => {
    expect(computeExitCode()).toBe(0);
  });

  it('non-degraded with many violations still blocks (the happy-path blocking case)', () => {
    expect(computeExitCode({ violations: 42, degradedFallback: false })).toBe(1);
  });
});
