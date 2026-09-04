/**
 * Unit tests for lib/worktree-reaper/preserve-stage.js
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-1a.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PRESERVE_FREEZE_CUT_MINUTES,
  PRESERVE_VERDICT,
  evaluatePreserveEligibility,
  findHolderSession,
  preserveTimestamp,
  buildPreserveRefName,
  scanStagedDiffForSecrets,
  runPreserveStage,
  appendReaperPreservedPointer,
} from '../../../lib/worktree-reaper/preserve-stage.js';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');

describe('evaluatePreserveEligibility()', () => {
  it('is eligible with no_holder when no session row is found', () => {
    expect(evaluatePreserveEligibility(null, NOW)).toEqual({ eligible: true, reason: 'no_holder' });
  });

  it('is eligible with holder_released when released_at is set', () => {
    const holder = { released_at: '2026-09-04T11:00:00.000Z', last_tool_at: null, loop_state: 'active' };
    expect(evaluatePreserveEligibility(holder, NOW)).toEqual({ eligible: true, reason: 'holder_released' });
  });

  it('is eligible with holder_frozen when the tool clock is frozen past the cut (mid-iteration)', () => {
    const holder = {
      released_at: null,
      loop_state: 'active',
      last_tool_at: new Date(NOW - (PRESERVE_FREEZE_CUT_MINUTES + 5) * 60000).toISOString(),
    };
    expect(evaluatePreserveEligibility(holder, NOW)).toEqual({ eligible: true, reason: 'holder_frozen' });
  });

  it('is ineligible (holder_live) for a holder with recent tool activity', () => {
    const holder = {
      released_at: null,
      loop_state: 'active',
      last_tool_at: new Date(NOW - 2 * 60000).toISOString(),
    };
    expect(evaluatePreserveEligibility(holder, NOW)).toEqual({ eligible: false, reason: 'holder_live' });
  });
});

describe('findHolderSession()', () => {
  it('returns the most-recent-heartbeat row for the given worktree_path', async () => {
    const row = { session_id: 's1', worktree_path: '/repo/.worktrees/x' };
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: [row], error: null }) }),
          }),
        }),
      }),
    };
    await expect(findHolderSession(supabase, '/repo/.worktrees/x')).resolves.toEqual(row);
  });

  it('fails open to null on any error (PRESERVE eligibility widens, never narrows)', async () => {
    const supabase = { from: () => { throw new Error('network exploded'); } };
    await expect(findHolderSession(supabase, '/repo/.worktrees/x')).resolves.toBeNull();
  });

  it('returns null when supabase is unavailable', async () => {
    await expect(findHolderSession(null, '/repo/.worktrees/x')).resolves.toBeNull();
  });

  it('QF-20260904-596: falls back to the branch-derived key\'s claim when worktree_path misses a live resident (slot-free worktree reuse)', async () => {
    const claimedSessionRow = { session_id: 's-live', released_at: null, last_tool_at: null, loop_state: 'active' };
    const supabase = {
      from: (table) => {
        if (table === 'claude_sessions') {
          return {
            select: () => ({
              eq: (col) => {
                if (col === 'worktree_path') {
                  return { order: () => ({ limit: async () => ({ data: [], error: null }) }) };
                }
                if (col === 'session_id') {
                  return { limit: async () => ({ data: [claimedSessionRow], error: null }) };
                }
                return { limit: async () => ({ data: [], error: null }) };
              },
            }),
          };
        }
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { claiming_session_id: 's-live' }, error: null }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await findHolderSession(supabase, '/repo/.worktrees/QF-old-reused-slot', { key: 'SD-EXAMPLE-002' });
    expect(result).toEqual(claimedSessionRow);
  });

  it('QF-20260904-596: falls back to quick_fixes for a QF-shaped key', async () => {
    const claimedSessionRow = { session_id: 's-qf-live' };
    const supabase = {
      from: (table) => {
        if (table === 'claude_sessions') {
          return {
            select: () => ({
              eq: (col) => {
                if (col === 'worktree_path') return { order: () => ({ limit: async () => ({ data: [], error: null }) }) };
                if (col === 'session_id') return { limit: async () => ({ data: [claimedSessionRow], error: null }) };
                return { limit: async () => ({ data: [], error: null }) };
              },
            }),
          };
        }
        if (table === 'quick_fixes') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { claiming_session_id: 's-qf-live' }, error: null }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await findHolderSession(supabase, '/repo/.worktrees/qf/old', { key: 'QF-20260904-596' });
    expect(result).toEqual(claimedSessionRow);
  });

  it('QF-20260904-596: returns null (no_holder) when the fallback key has no claim either', async () => {
    const supabase = {
      from: (table) => {
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
        }
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { claiming_session_id: null }, error: null }) }) }) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await findHolderSession(supabase, '/repo/.worktrees/x', { key: 'SD-NOBODY-001' });
    expect(result).toBeNull();
  });

  it('QF-20260904-596: skips the fallback entirely when no key is supplied (backward compatible)', async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
    };
    await expect(findHolderSession(supabase, '/repo/.worktrees/x')).resolves.toBeNull();
  });
});

describe('preserveTimestamp() / buildPreserveRefName()', () => {
  it('produces a ref-safe timestamp with no colons or dots', () => {
    const ts = preserveTimestamp(NOW);
    expect(ts).not.toMatch(/[:.]/);
  });

  it('never targets the tree\'s own branch namespace', () => {
    const ref = buildPreserveRefName('SD-EXAMPLE-001', '2026-09-04T12-00-00-000Z');
    expect(ref).toBe('wip/reclaim/SD-EXAMPLE-001/2026-09-04T12-00-00-000Z');
  });
});

describe('scanStagedDiffForSecrets()', () => {
  it('filters to CRIT-001 only and holds on a hardcoded-secret hit', () => {
    const diff = '+SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI';
    const result = scanStagedDiffForSecrets(diff);
    expect(result.held).toBe(true);
    expect(result.findings.every((f) => f.id === 'CRIT-001')).toBe(true);
  });

  it('does not hold on an unrelated added line', () => {
    const result = scanStagedDiffForSecrets('+const x = 1;');
    expect(result.held).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it('never holds on an empty/undefined diff', () => {
    expect(scanStagedDiffForSecrets('').held).toBe(false);
    expect(scanStagedDiffForSecrets(undefined).held).toBe(false);
  });
});

function makeGitRunner(script) {
  // script: array of {match: RegExp-on-args.join(' '), result}
  return vi.fn((args) => {
    const cmd = args.join(' ');
    for (const s of script) {
      if (s.match.test(cmd)) return s.result;
    }
    return { code: 0, stdout: '', stderr: '' };
  });
}

describe('runPreserveStage() (TS-2 partial, TS-4, TS-5)', () => {
  it('TS-2 (happy path): stages, commits, pushes, and verifies against local HEAD', async () => {
    const sha = 'abc123deadbeef';
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: 'untracked.txt\n' } },
      { match: /^diff --cached --quiet/, result: { code: 1, stdout: '' } }, // has staged changes
      { match: /^diff --cached$/, result: { code: 0, stdout: '+const x = 1;' } },
      { match: /^commit/, result: { code: 0, stdout: '' } },
      { match: /^push origin/, result: { code: 0, stdout: '' } },
      { match: /^rev-parse HEAD/, result: { code: 0, stdout: `${sha}\n` } },
      { match: /^ls-remote origin/, result: { code: 0, stdout: `${sha}\trefs/heads/wip/reclaim/foo\n` } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
    expect(result.pushed).toBe(true);
    expect(result.sha).toBe(sha);
    expect(result.ref).toMatch(/^wip\/reclaim\/foo\//);
  });

  it('TS-4 (push failure blocks removal): a failed push never reaches removal, tree left untouched', async () => {
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 1, stdout: '' } },
      { match: /^diff --cached$/, result: { code: 0, stdout: '+const x = 1;' } },
      { match: /^commit/, result: { code: 0, stdout: '' } },
      { match: /^push origin/, result: { code: 1, stdout: '', stderr: 'simulated network failure' } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSH_FAILED);
    expect(result.pushed).toBe(false);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'push')).toBe(true);
    // no ls-remote verify ever attempted once push failed
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'ls-remote')).toBe(false);
  });

  it('TS-5 (secret hit holds and never pushes): zero push invocations, verdict preserve_held_secret', async () => {
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 1, stdout: '' } },
      { match: /^diff --cached$/, result: { code: 0, stdout: '+SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI' } },
      { match: /^reset/, result: { code: 0, stdout: '' } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.HELD_SECRET);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'push')).toBe(false);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(false);
    // the tree is left as found
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'reset')).toBe(true);
  });

  it('pushes an already-clean (unpushed-commit-only) tree with nothing staged', async () => {
    const sha = 'clean0sha';
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 0, stdout: '' } }, // nothing staged
      { match: /^push origin/, result: { code: 0, stdout: '' } },
      { match: /^rev-parse HEAD/, result: { code: 0, stdout: `${sha}\n` } },
      { match: /^ls-remote origin/, result: { code: 0, stdout: `${sha}\trefs/heads/wip/reclaim/foo\n` } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(false);
  });

  it('reports preserve_verify_failed when the pushed sha does not match ls-remote', async () => {
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 0, stdout: '' } },
      { match: /^push origin/, result: { code: 0, stdout: '' } },
      { match: /^rev-parse HEAD/, result: { code: 0, stdout: 'localsha\n' } },
      { match: /^ls-remote origin/, result: { code: 0, stdout: 'differentsha\trefs/heads/wip/reclaim/foo\n' } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.VERIFY_FAILED);
    expect(result.pushed).toBe(true);
  });
});

describe('runPreserveStage() never advances the checked-out branch (QF-20260904-596)', () => {
  it('resets to the pre-preserve tip immediately after committing, and pushes the captured sha (not the bare HEAD token)', async () => {
    const originalHead = 'original0head0sha';
    const committedSha = 'committed1sha1here';
    let revParseCallCount = 0;
    const gitRunner = vi.fn((args) => {
      const cmd = args.join(' ');
      if (/^ls-files --others/.test(cmd)) return { code: 0, stdout: 'untracked.txt\n' };
      if (/^diff --cached --quiet/.test(cmd)) return { code: 1, stdout: '' };
      if (/^diff --cached$/.test(cmd)) return { code: 0, stdout: '+const x = 1;' };
      if (/^commit/.test(cmd)) return { code: 0, stdout: '' };
      if (/^rev-parse HEAD/.test(cmd)) {
        revParseCallCount += 1;
        return { code: 0, stdout: (revParseCallCount === 1 ? originalHead : committedSha) + '\n' };
      }
      if (/^push origin/.test(cmd)) return { code: 0, stdout: '' };
      if (/^ls-remote origin/.test(cmd)) return { code: 0, stdout: `${committedSha}\trefs/heads/wip/reclaim/foo\n` };
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
    expect(result.sha).toBe(committedSha);

    const resetCall = gitRunner.mock.calls.find((c) => c[0][0] === 'reset');
    expect(resetCall).toBeDefined();
    expect(resetCall[0]).toEqual(['reset', originalHead]);

    const pushCall = gitRunner.mock.calls.find((c) => c[0][0] === 'push');
    expect(pushCall[0][2]).toBe(`${committedSha}:refs/heads/${result.ref}`);

    // The reset must happen BEFORE the push -- never after -- so a push failure can
    // never leave the commit reachable from the checked-out branch.
    const resetIndex = gitRunner.mock.calls.findIndex((c) => c[0][0] === 'reset');
    const pushIndex = gitRunner.mock.calls.findIndex((c) => c[0][0] === 'push');
    expect(resetIndex).toBeLessThan(pushIndex);
  });

  it('resets to the pre-preserve tip even when the push fails, so a push failure never leaves the commit on the checked-out branch', async () => {
    const originalHead = 'orig-head-push-fail';
    let revParseCallCount = 0;
    const gitRunner = vi.fn((args) => {
      const cmd = args.join(' ');
      if (/^ls-files --others/.test(cmd)) return { code: 0, stdout: '' };
      if (/^diff --cached --quiet/.test(cmd)) return { code: 1, stdout: '' };
      if (/^diff --cached$/.test(cmd)) return { code: 0, stdout: '+const x = 1;' };
      if (/^commit/.test(cmd)) return { code: 0, stdout: '' };
      if (/^rev-parse HEAD/.test(cmd)) {
        revParseCallCount += 1;
        return { code: 0, stdout: (revParseCallCount === 1 ? originalHead : 'committed-sha-2') + '\n' };
      }
      if (/^push origin/.test(cmd)) return { code: 1, stdout: '', stderr: 'simulated failure' };
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSH_FAILED);
    const resetCall = gitRunner.mock.calls.find((c) => c[0][0] === 'reset');
    expect(resetCall).toBeDefined();
    expect(resetCall[0]).toEqual(['reset', originalHead]);
  });
});

describe('appendReaperPreservedPointer()', () => {
  it('skips QF-owned rows (quick_fixes has no metadata column) -- audit_log remains authoritative', async () => {
    const result = await appendReaperPreservedPointer(
      { from: vi.fn() },
      { key: 'QF-20260904-001', isQf: true },
      { ref: 'wip/reclaim/QF-20260904-001/ts' }
    );
    expect(result).toEqual({ ok: false, skipped: true, reason: 'quick_fixes_no_metadata_column' });
  });

  it('appends to metadata.reaper_preserved[] for an SD row, never overwriting other metadata', async () => {
    const existingRow = { id: 'row-1', metadata: { other: 'field' }, updated_at: 't0' };
    let updatePayload = null;
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: existingRow, error: null }) }) }),
        update: (payload) => { updatePayload = payload; return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'row-1' }, error: null }) }) }) }) }; },
      }),
    };

    const pointer = { ref: 'wip/reclaim/SD-X/ts', sha: 'abc' };
    const result = await appendReaperPreservedPointer(supabase, { key: 'SD-X', isQf: false }, pointer);

    expect(result.ok).toBe(true);
    expect(updatePayload.metadata.other).toBe('field');
    expect(updatePayload.metadata.reaper_preserved).toEqual([pointer]);
  });

  it('retries on an optimistic-concurrency conflict (updated_at moved) then gives up after max retries', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'row-1', metadata: {}, updated_at: 't0' }, error: null }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }), // always loses the race
      }),
    };
    const result = await appendReaperPreservedPointer(supabase, { key: 'SD-X', isQf: false }, { ref: 'r' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('max_retries_exceeded');
  });

  it('returns ok:false without throwing when supabase is unavailable', async () => {
    const result = await appendReaperPreservedPointer(null, { key: 'SD-X', isQf: false }, { ref: 'r' });
    expect(result).toEqual({ ok: false, skipped: true, reason: 'no_supabase_client' });
  });
});
