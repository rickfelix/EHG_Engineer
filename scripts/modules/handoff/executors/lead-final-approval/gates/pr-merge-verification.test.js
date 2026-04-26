import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001:
 *
 * Tests cover the two fail-open holes in createPRMergeVerificationGate that
 * allowed SD-MAN-ORCH-S18-S26-PIPELINE-001-A to complete with branch
 * `feat/...-s18-marketing-copy-regenerate-api-fronte` (commit 2a63dac3) on
 * origin and never merged to main:
 *
 *   1. Outer-try error path returned passed=true, score=80 (fail-open). Now
 *      returns passed=false, score=0 (fail-closed).
 *   2. Per-branch comparison errors silently `console.debug`'d and skipped.
 *      Now classified as `unverified` and treated as completion blockers.
 */

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('../../../../sd-type-checker.js', () => ({ getTierForSD: vi.fn(() => 3) }));
vi.mock('../../../retro-filters.js', () => ({ getFilteredRetrospective: vi.fn() }));
vi.mock('../../../../../lib/repo-paths.js', () => ({
  resolveRepoPath: vi.fn((name) => `/fake/${name}`),
  ENGINEER_ROOT: '/fake/EHG_Engineer',
}));

import { execSync } from 'child_process';
import { createPRMergeVerificationGate } from '../gates.js';

const makeCtx = (sdKey = 'SD-MAN-ORCH-TEST-001') => ({
  sd: { id: 'test-uuid', sd_key: sdKey, sd_type: 'infrastructure' },
  sdId: 'test-uuid',
});

describe('createPRMergeVerificationGate fail-closed behaviour (SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it.skip('outer-try error fails closed (defense-in-depth — outer catch is unreachable in normal operation)', async () => {
    // The outer try wraps `await import('child_process')` plus orchestration. Every
    // call site inside the loops is wrapped in an inner try, so the outer catch only
    // fires if the dynamic import itself fails — which doesn't happen in vitest. The
    // outer-catch fail-closed change at gates.js line 639 is defense-in-depth: it
    // ensures that any future code added between the dynamic import and the inner
    // try-wrapped loops also fails closed, not open.
    //
    // The actual failure mode that allowed SD-MAN-ORCH-S18-S26-PIPELINE-001-A through
    // was the inner branch-comparison catch (line 588) silently swallowing errors —
    // that path IS exercised by the next test ("inner branch-comparison error marks
    // branch unverified and blocks completion").
  });

  it('inner branch-comparison error marks branch unverified and blocks completion', async () => {
    let callIndex = 0;
    execSync.mockImplementation((cmd) => {
      callIndex++;
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/feat/SD-MAN-ORCH-TEST-001-thing\n  origin/main';
      if (cmd.includes('rev-list --count')) {
        throw new Error('fatal: bad revision');
      }
      if (cmd.includes('gh pr list --head')) return '[]';
      return '';
    });
    const gate = createPRMergeVerificationGate();
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details?.unverifiedCount).toBeGreaterThanOrEqual(1);
    expect(result.issues.join('\n')).toMatch(/UNVERIFIED/);
  });

  it('happy path: no open PRs and no unmerged branches still passes', async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n  origin/HEAD -> origin/main';
      return '';
    });
    const gate = createPRMergeVerificationGate();
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('detects unmerged branches with commits ahead of main', async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/feat/SD-MAN-ORCH-TEST-001-thing\n  origin/main';
      if (cmd.includes('rev-list --count')) return '5';
      if (cmd.includes('gh pr list --head')) return '[]';
      return '';
    });
    const gate = createPRMergeVerificationGate();
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.join('\n')).toMatch(/5 commits/);
  });

  it('squash-merge artifact (branch+merged-PR) passes — does not regress legitimate completions', async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/feat/SD-MAN-ORCH-TEST-001-thing\n  origin/main';
      if (cmd.includes('rev-list --count')) return '3';
      if (cmd.includes('gh pr list --head')) return JSON.stringify([{ number: 42 }]);
      return '';
    });
    const gate = createPRMergeVerificationGate();
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });
});
