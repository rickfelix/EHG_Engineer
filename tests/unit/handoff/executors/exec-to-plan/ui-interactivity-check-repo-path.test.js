/**
 * SD-LEO-INFRA-REPO-HYGIENE-PATH-001 -- RCA finding: a resolveRepoPath('ehg') that returns a
 * nonexistent path previously made every execSync call in this gate throw ENOENT, which the
 * generic catch(err) block silently converted to `passed: true, score: 70` -- indistinguishable
 * from a genuine pass for every EHG feature SD run from a worktree. This test proves the gate
 * now fails closed (passed: false) when the resolved repo path doesn't exist, rather than
 * relying on the catch-all to camouflage the problem as an advisory pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/repo-paths.js', () => ({
  resolveRepoPath: vi.fn(),
}));

import { resolveRepoPath } from '../../../../../lib/repo-paths.js';
import { createUiInteractivityCheckGate } from '../../../../../scripts/modules/handoff/executors/exec-to-plan/gates/ui-interactivity-check.js';

describe('UI_INTERACTIVITY_CHECK gate — resolved repo path validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed (passed:false) when resolveRepoPath returns a nonexistent path', async () => {
    resolveRepoPath.mockReturnValue('C:\\this\\path\\does\\not\\exist\\anywhere');

    const gate = createUiInteractivityCheckGate({});
    const sd = { target_application: 'EHG', sd_type: 'feature', sd_key: 'SD-TEST-001' };
    const result = await gate.validator({ sd });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toMatch(/nonexistent path/);
  });

  it('fails closed when resolveRepoPath returns null', async () => {
    resolveRepoPath.mockReturnValue(null);

    const gate = createUiInteractivityCheckGate({});
    const sd = { target_application: 'EHG', sd_type: 'feature', sd_key: 'SD-TEST-002' };
    const result = await gate.validator({ sd });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('still skips (unrelated to repo-path validity) when the SD is not an EHG feature', async () => {
    resolveRepoPath.mockReturnValue('C:\\this\\path\\does\\not\\exist\\anywhere');

    const gate = createUiInteractivityCheckGate({});
    const sd = { target_application: 'EHG_Engineer', sd_type: 'infrastructure', sd_key: 'SD-TEST-003' };
    const result = await gate.validator({ sd });

    // Skip check happens BEFORE repo-path resolution -- resolveRepoPath should never even be
    // called for a non-applicable SD.
    expect(result.passed).toBe(true);
    expect(resolveRepoPath).not.toHaveBeenCalled();
  });
});
