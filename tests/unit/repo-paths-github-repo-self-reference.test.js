// SD-LEO-INFRA-CANONICAL-REPO-APP-001 (FR-2): direct, non-quarantined coverage for the
// resolveGitHubRepo() EHG_Engineer self-reference fix. The equivalent assertions in
// tests/unit/repo-paths.test.js are inert — that whole file is excluded by a pre-existing
// quarantine entry (tests/quarantine-manifest.json, reason_class=assertion-drift, unrelated
// to this SD). This file gives the fix direct unit-level regression coverage in addition to
// the indirect coverage already provided by orphan-qf-reaper-integration.test.js's TS-1/TS-2.
import { describe, it, expect } from 'vitest';
import { resolveGitHubRepo } from '../../lib/repo-paths.js';

describe('resolveGitHubRepo() — EHG_Engineer self-reference (FR-2 fix)', () => {
  it('resolves an explicit EHG_Engineer string to its own repo (not null)', () => {
    expect(resolveGitHubRepo('EHG_Engineer')).toBe('rickfelix/EHG_Engineer');
  });

  it('resolves case/separator-insensitively', () => {
    expect(resolveGitHubRepo('ehg_engineer')).toBe('rickfelix/EHG_Engineer');
    expect(resolveGitHubRepo('EHGEngineer')).toBe('rickfelix/EHG_Engineer');
  });

  it('still returns null for a genuinely unknown app (fail-loud contract upstream)', () => {
    expect(resolveGitHubRepo('TotallyUnknownApp12345')).toBeNull();
  });
});
