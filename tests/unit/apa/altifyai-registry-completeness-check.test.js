import { describe, it, expect } from 'vitest';
import { checkCompleteness } from '../../../scripts/altifyai-registry-completeness-check.mjs';

// SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 FR-12.
// Pure-function coverage for the CI hard gate (scripts/altifyai-registry-completeness-check.mjs).
// The live-DB path (fetchCurrentJourneyArtifact / fail-closed on an unreadable spec) is exercised
// by the script itself when run in altifyai-uat-drift-check-cron.yml, not here -- vitest's unit
// project has no live Supabase credentials by design.

describe('checkCompleteness', () => {
  it('TS-6a: passes with a non-empty allowlist while some spec steps are unregistered', () => {
    const result = checkCompleteness({
      specStepIds: ['a', 'b', 'c', 'd'],
      registryKeys: ['a', 'b', 'c'],
      allowlist: ['d'],
    });
    expect(result).toEqual({ ok: true, missing: [], staleAllowlist: [] });
  });

  it('TS-6b: passes with an empty allowlist once every spec step is registered', () => {
    const result = checkCompleteness({
      specStepIds: ['a', 'b', 'c', 'd'],
      registryKeys: ['a', 'b', 'c', 'd'],
      allowlist: [],
    });
    expect(result).toEqual({ ok: true, missing: [], staleAllowlist: [] });
  });

  it('fails when a spec step has no override and is not on the allowlist', () => {
    const result = checkCompleteness({
      specStepIds: ['a', 'b', 'c'],
      registryKeys: ['a', 'b'],
      allowlist: [],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['c']);
    expect(result.staleAllowlist).toEqual([]);
  });

  it('D10/TS-6-disjointness: fails when an allowlist entry is ALREADY registered (stale entry masking a real override)', () => {
    const result = checkCompleteness({
      specStepIds: ['a', 'b', 'c'],
      registryKeys: ['a', 'b', 'c'],
      allowlist: ['c'], // c is registered -- should have been removed from the allowlist
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.staleAllowlist).toEqual(['c']);
  });

  it('TS-7: a truncated-prefix registration does not satisfy the full spec step_id', () => {
    // Simulates the zero-yield hazard: an override registered under 'stp-6aa6' instead of the
    // full 'stp-6aa6-view-a-list-of-all-m' is a registry MISS, not a hit.
    const result = checkCompleteness({
      specStepIds: ['stp-6aa6-view-a-list-of-all-m'],
      registryKeys: ['stp-6aa6'], // wrong -- truncated
      allowlist: [],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['stp-6aa6-view-a-list-of-all-m']);
  });

  it('reports both a missing step and a stale allowlist entry simultaneously', () => {
    const result = checkCompleteness({
      specStepIds: ['a', 'b', 'c'],
      registryKeys: ['a'],
      allowlist: ['b', 'a'], // 'a' is stale (already registered); 'c' is missing entirely
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['c']);
    expect(result.staleAllowlist).toEqual(['a']);
  });
});
