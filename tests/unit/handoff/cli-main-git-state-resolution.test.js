/**
 * SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001 (FR-4): coverage for
 * resolveAndCheckGitState, the extracted, injectable-dependency helper behind
 * handlePrecheckCommand's Step 1 git-state check. Covers TS-10 (DB-tier
 * reachability — supabase is no longer hardcoded null) and TS-12 (the
 * resolved-vs-isVenture branching contract).
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveAndCheckGitState } from '../../../scripts/modules/handoff/cli/cli-main.js';

describe('resolveAndCheckGitState', () => {
  it('TS-10: passes a real (non-null) supabase client through to resolveGateRepoContext', async () => {
    const supabase = { from: vi.fn() }; // a real client, not null
    const resolveGateRepoContext = vi.fn().mockResolvedValue({ resolved: true, isVenture: true, repoPath: '/ventures/x' });
    const checkGitState = vi.fn().mockResolvedValue({ passed: true, issues: [], warnings: [] });

    await resolveAndCheckGitState({ target_application: 'SomeVenture' }, { resolveGateRepoContext, checkGitState, supabase });

    expect(resolveGateRepoContext).toHaveBeenCalledWith({ target_application: 'SomeVenture' }, supabase);
    expect(resolveGateRepoContext.mock.calls[0][1]).not.toBeNull();
  });

  it('TS-12: an EHG-platform SD (isVenture:false, resolved:true) still gets checkGitState called WITH its resolved repoPath, not the empty-options branch', async () => {
    const resolveGateRepoContext = vi.fn().mockResolvedValue({ resolved: true, isVenture: false, repoPath: '/repos/ehg' });
    const checkGitState = vi.fn().mockResolvedValue({ passed: true, issues: [], warnings: [] });

    await resolveAndCheckGitState({ target_application: 'EHG' }, { resolveGateRepoContext, checkGitState, supabase: {} });

    expect(checkGitState).toHaveBeenCalledWith({ cwd: '/repos/ehg' });
  });

  it('a genuine venture SD (isVenture:true, resolved:true) gets checkGitState called with its resolved repoPath', async () => {
    const resolveGateRepoContext = vi.fn().mockResolvedValue({ resolved: true, isVenture: true, repoPath: '/repos/altifyai' });
    const checkGitState = vi.fn().mockResolvedValue({ passed: true, issues: [], warnings: [] });

    await resolveAndCheckGitState({ metadata: { qf_target_application: 'altifyai' } }, { resolveGateRepoContext, checkGitState, supabase: {} });

    expect(checkGitState).toHaveBeenCalledWith({ cwd: '/repos/altifyai' });
  });

  it('resolved:false (unresolvable venture) skips checkGitState entirely and reports UNRESOLVABLE_VENTURE_REPO', async () => {
    const resolveGateRepoContext = vi.fn().mockResolvedValue({ resolved: false, isVenture: true, repoPath: null });
    const checkGitState = vi.fn();

    const result = await resolveAndCheckGitState({ target_application: 'zzz-nonexistent' }, { resolveGateRepoContext, checkGitState, supabase: {} });

    expect(checkGitState).not.toHaveBeenCalled();
    expect(result.passed).toBe(true);
    expect(result.warnings.some((w) => w.includes('UNRESOLVABLE_VENTURE_REPO'))).toBe(true);
  });

  it('resolved:false via INCOMPLETE_SD_ROW also skips checkGitState (never silently uses the ambient cwd)', async () => {
    const resolveGateRepoContext = vi.fn().mockResolvedValue({ resolved: false, isVenture: false, repoPath: null, reason: 'INCOMPLETE_SD_ROW' });
    const checkGitState = vi.fn();

    const result = await resolveAndCheckGitState({ id: 'x' }, { resolveGateRepoContext, checkGitState, supabase: {} });

    expect(checkGitState).not.toHaveBeenCalled();
    expect(result.passed).toBe(true);
  });
});
