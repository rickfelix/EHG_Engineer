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

// SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C (FR-2, TS-3) — a stale snapshot must FAIL, not warn.
// Every verdict is computed against the committed snapshot, so a zero measured against a snapshot
// older than the schema is "agrees with a stale picture", not "matches the live schema" — and it
// used to print identically to a genuine clean run.
describe('computeExitCode — snapshot staleness (FR-2)', () => {
  it('TS-3a: a stale snapshot blocks even with ZERO violations — this is the false-zero trap', () => {
    expect(computeExitCode({ violations: 0, degradedFallback: false, snapshotStale: true })).toBe(1);
  });

  it('TS-3b: a stale snapshot blocks with violations too', () => {
    expect(computeExitCode({ violations: 5, degradedFallback: false, snapshotStale: true })).toBe(1);
  });

  it('TS-3c: a FRESH snapshot with zero violations still exits 0 — staleness is not a blanket block', () => {
    expect(computeExitCode({ violations: 0, degradedFallback: false, snapshotStale: false })).toBe(0);
  });

  it('TS-3d: degradedFallback still wins over staleness (advisory runs never block)', () => {
    // Deliberate precedence: a degraded run announces itself as advisory and asserts no pass, so
    // there is no false zero to protect against. Making it block would re-introduce the
    // flaky-fetch false-blocking SD-LEO-INFRA-SCHEMA-LINT-DEGRADED-FAILOPEN-001 removed.
    expect(computeExitCode({ violations: 0, degradedFallback: true, snapshotStale: true })).toBe(0);
  });

  it('TS-3e: omitting snapshotStale is byte-identical to the pre-FR-2 behaviour', () => {
    expect(computeExitCode({ violations: 0, degradedFallback: false })).toBe(0);
    expect(computeExitCode({ violations: 3, degradedFallback: false })).toBe(1);
    expect(computeExitCode({ violations: 3, degradedFallback: true })).toBe(0);
  });
});
