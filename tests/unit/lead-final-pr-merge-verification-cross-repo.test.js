/**
 * computeReposForSD unit tests
 * SD-LEO-INFRA-CROSS-REPO-MERGE-001 (FR-4)
 *
 * Verifies the precedence rules and case-handling of the repo-scope helper
 * used by PR_MERGE_VERIFICATION at LEAD-FINAL-APPROVAL.
 *
 *   Tier 1: metadata.target_repos[]    → explicit allowlist
 *   Tier 2: target_application         → single-repo derivation (case-insensitive)
 *   Tier 3: fallback both with WARN    → legacy SDs without metadata
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeReposForSD } from '../../scripts/modules/handoff/executors/lead-final-approval/gates.js';

describe('computeReposForSD (SD-LEO-INFRA-CROSS-REPO-MERGE-001)', () => {
  let warnSpy, logSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('FR-4a: target_application=EHG_Engineer → only scans EHG_Engineer', () => {
    const sd = { sd_key: 'SD-DEMO-CR-001', target_application: 'EHG_Engineer', metadata: null };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(1);
    expect(result[0].githubRepo).toBe('rickfelix/EHG_Engineer');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    const allLogMessages = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allLogMessages).toContain('[GATE_PR_MERGE_REPO_SCOPE]');
    expect(allLogMessages).toContain('rickfelix/EHG_Engineer');
  });

  it('FR-4b: target_application=EHG → only scans EHG', () => {
    const sd = { sd_key: 'SD-DEMO-CR-002', target_application: 'EHG', metadata: null };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(1);
    expect(result[0].githubRepo).toBe('rickfelix/ehg');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('FR-4c: metadata.target_repos[] wins over target_application', () => {
    const sd = {
      sd_key: 'SD-DEMO-CR-003',
      target_application: 'EHG_Engineer',
      metadata: { target_repos: ['EHG', 'EHG_Engineer'] }
    };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(2);
    const repos = result.map(r => r.githubRepo);
    expect(repos).toContain('rickfelix/ehg');
    expect(repos).toContain('rickfelix/EHG_Engineer');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('FR-4d: NULL target_application + NULL metadata → fallback both with WARN', () => {
    const sd = { sd_key: 'SD-DEMO-CR-004', target_application: null, metadata: null };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0];
    expect(warnMsg).toContain('[GATE_PR_MERGE_REPO_SCOPE]');
    expect(warnMsg).toContain('legacy behavior');
  });

  it('FR-4e: venture-name target_application falls back to both with WARN', () => {
    const sd = { sd_key: 'SD-DEMO-CR-005', target_application: 'PrivacyPatrol AI', metadata: null };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('FR-4f: target_application case-insensitive (lowercase ehg_engineer)', () => {
    const sd = { sd_key: 'SD-DEMO-CR-006', target_application: 'ehg_engineer', metadata: null };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(1);
    expect(result[0].githubRepo).toBe('rickfelix/EHG_Engineer');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('FR-4g: empty target_repos[] falls through to target_application', () => {
    const sd = {
      sd_key: 'SD-DEMO-CR-007',
      target_application: 'EHG_Engineer',
      metadata: { target_repos: [] }
    };
    const result = computeReposForSD(sd);
    expect(result).toHaveLength(1);
    expect(result[0].githubRepo).toBe('rickfelix/EHG_Engineer');
  });
});
