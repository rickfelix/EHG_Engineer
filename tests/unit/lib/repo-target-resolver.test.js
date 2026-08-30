/**
 * Unit tests for computeReposForSD() at its extracted, canonical location
 * (lib/sub-agents/repo-target-resolver.js), independent of any handoff-executor context.
 *
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-F (FR-1, AC-1.3)
 *
 * @module tests/unit/lib/repo-target-resolver.test
 */

import { describe, it, expect } from 'vitest';
import { computeReposForSD } from '../../../lib/sub-agents/repo-target-resolver.js';

describe('computeReposForSD() — extracted module, isolated', () => {
  it('is a function importable directly from lib/sub-agents/repo-target-resolver.js', () => {
    expect(typeof computeReposForSD).toBe('function');
  });

  it('Tier 1: metadata.target_repos allowlist with both entries returns both repos', () => {
    const sd = { sd_key: 'SD-TEST-001', metadata: { target_repos: ['EHG', 'EHG_Engineer'] } };
    const result = computeReposForSD(sd);
    expect(result.length).toBe(2);
    expect(result.map(r => r.githubRepo).sort()).toEqual(['rickfelix/EHG_Engineer', 'rickfelix/ehg'].sort());
  });

  it('Tier 1: an invalid entry alongside a valid one filters down to just the valid entry (not length-based)', () => {
    const sd = { sd_key: 'SD-TEST-002', metadata: { target_repos: ['EHG', 'bogus'] } };
    const result = computeReposForSD(sd);
    expect(result.length).toBe(1);
    expect(result[0].githubRepo).toBe('rickfelix/ehg');
  });

  it('Tier 2: target_application=EHG_Engineer resolves to EHG_Engineer only', () => {
    const sd = { sd_key: 'SD-TEST-003', target_application: 'EHG_Engineer' };
    const result = computeReposForSD(sd);
    expect(result.length).toBe(1);
    expect(result[0].githubRepo).toBe('rickfelix/EHG_Engineer');
  });

  it('Tier 2: target_application=EHG resolves to EHG only', () => {
    const sd = { sd_key: 'SD-TEST-004', target_application: 'EHG' };
    const result = computeReposForSD(sd);
    expect(result.length).toBe(1);
    expect(result[0].githubRepo).toBe('rickfelix/ehg');
  });

  it('Tier 3: all-invalid target_repos AND no target_application falls through to both repos (legacy)', () => {
    const sd = { sd_key: 'SD-TEST-005', metadata: { target_repos: ['bogus', 'garbage'] } };
    const result = computeReposForSD(sd);
    expect(result.length).toBe(2);
  });

  it('Tier 3: no metadata and no target_application falls through to both repos (legacy)', () => {
    const sd = { sd_key: 'SD-TEST-006' };
    const result = computeReposForSD(sd);
    expect(result.length).toBe(2);
  });
});
