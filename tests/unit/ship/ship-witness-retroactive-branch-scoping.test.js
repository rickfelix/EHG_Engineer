/**
 * SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (FR-2): scripts/ship-witness-retroactive.mjs
 * is a SECOND consumer that independently wires defaultFetchReviewFinding — it must
 * inherit the same branch-scoping fix as the live-gating venture-trust-gate.mjs path,
 * not just the CLI's original behavior.
 */
import { describe, it, expect, vi } from 'vitest';

const H = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  spawnSyncMock: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

vi.mock('node:child_process', () => ({
  execFileSync: H.execFileSyncMock,
  spawnSync: H.spawnSyncMock,
}));

const { resolvePrBranch, runRetroactiveEvaluation } = await import('../../../scripts/ship-witness-retroactive.mjs');

describe('resolvePrBranch', () => {
  it('resolves the head branch via gh pr view -R <repo>', () => {
    H.execFileSyncMock.mockReturnValueOnce('feat/apex-D1\n');
    const branch = resolvePrBranch(9, 'rickfelix', 'apexniche-ai');
    expect(branch).toBe('feat/apex-D1');
    expect(H.execFileSyncMock).toHaveBeenCalledWith(
      'gh',
      ['pr', 'view', '9', '-R', 'rickfelix/apexniche-ai', '--json', 'headRefName', '--jq', '.headRefName'],
      expect.any(Object),
    );
  });

  it('returns null (not a fabricated value) when the gh call fails — e.g. branch already deleted post-merge', () => {
    H.execFileSyncMock.mockImplementationOnce(() => { throw new Error('gh: not found'); });
    expect(resolvePrBranch(9, 'rickfelix', 'apexniche-ai')).toBeNull();
  });

  it('returns null on an empty result', () => {
    H.execFileSyncMock.mockReturnValueOnce('\n');
    expect(resolvePrBranch(9, 'rickfelix', 'apexniche-ai')).toBeNull();
  });
});

describe('runRetroactiveEvaluation — branch threading (FR-2)', () => {
  it('threads the resolved branch into evaluateMergeWorkLadder so P2 is scoped, not pr_number-only', async () => {
    // Branch resolution goes through execFileSync (resolvePrBranch); verifyMerged
    // and fetchStatusCheckRollup go through spawnSync (auto-merge.mjs's defaultRunner)
    // — the hoisted spawnSync mock's default {status:0, stdout:''} stub degrades both
    // to their safe empty-result paths (merged=false, statusCheckRollup=[]).
    H.execFileSyncMock.mockReturnValueOnce('feat/apex-D1\n');

    let seenBranch;
    const findingsRows = [
      { pr_number: 9, branch: 'feat/ml-I1', verdict: 'pass' },
      { pr_number: 9, branch: 'feat/apex-D1', verdict: 'block' },
    ];
    const supabase = {
      from: (table) => {
        if (table !== 'ship_review_findings') throw new Error(`unexpected table ${table}`);
        const builder = {
          select: () => builder,
          eq: (col, val) => { builder._f = { ...(builder._f || {}), [col]: val }; if (col === 'branch') seenBranch = val; return builder; },
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => {
            const f = builder._f || {};
            const row = findingsRows.find((r) => Object.entries(f).every(([k, v]) => r[k] === v));
            return Promise.resolve({ data: row ?? null, error: null });
          },
        };
        return builder;
      },
    };

    const result = await runRetroactiveEvaluation({
      repo: 'rickfelix/apexniche-ai', pr: '9', workKey: null, tier: 'standard', reason: 'test', supabase,
    });

    expect(seenBranch).toBe('feat/apex-D1');
    // apex's OWN row is verdict='block' -- must not witness-pass off marketlens's row.
    expect(result.witnessPass).toBe(false);
  });
});
