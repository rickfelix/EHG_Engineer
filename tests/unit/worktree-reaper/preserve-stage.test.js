/**
 * Unit tests for lib/worktree-reaper/preserve-stage.js
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-1a.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PRESERVE_FREEZE_CUT_MINUTES,
  PRESERVE_VERDICT,
  evaluatePreserveEligibility,
  findHolderSession,
  preserveTimestamp,
  buildPreserveRefName,
  scanStagedDiffForSecrets,
  splitCachedDiffByFile,
  scanStagedFilesForSecrets,
  withholdMatchedFiles,
  isDenylistedUntrackedPath,
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

  // QF-20260911-379 (b): the CRIT-001 key scanner let an identity file through.
  it('QF-20260911-379: holds on an ADDED email address and on an identity-shaped JSON field', () => {
    const r = scanStagedDiffForSecrets('+  "account_email": "chairman@example.com",\n+  "os_username": "rick"');
    expect(r.held).toBe(true);
    expect(r.findings.map((f) => f.id).sort()).toEqual(['PII-EMAIL', 'PII-HOST-IDENTITY']);
    expect(JSON.stringify(r.findings)).not.toContain('example.com'); // category only, never the excerpt
  });

  it('QF-20260911-379: a REMOVED email line (redaction to a placeholder) does not hold', () => {
    expect(scanStagedDiffForSecrets('-  "account_email": "chairman@example.com"\n+  "account_email": "<redacted>"').held).toBe(false);
  });
});

describe('isDenylistedUntrackedPath() (QF-20260911-379)', () => {
  it('refuses per-host identity/state files at any depth, including Windows separators', () => {
    for (const p of ['.account-identity-last.json', 'sub/dir/.account-identity-last.json', '.env.local', 'certs/server.pem',
      '.ehg-session.json', 'state\\my-host-state.json']) expect(isDenylistedUntrackedPath(p), p).toBe(true);
  });
  it('passes ordinary untracked files', () => {
    for (const p of ['untracked.txt', 'src/env-helper.js', 'docs/keys-overview.md', '.env.example', '.env.project-template'])
      expect(isDenylistedUntrackedPath(p), p).toBe(false);
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
      { match: /^diff --cached --name-only/, result: { code: 0, stdout: 'untracked.txt\n' } },
      { match: /^diff --cached -- untracked\.txt/, result: { code: 0, stdout: 'diff --git a/untracked.txt b/untracked.txt\n+const x = 1;' } },
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
      { match: /^diff --cached --name-only/, result: { code: 0, stdout: 'src/foo.js\n' } },
      { match: /^diff --cached -- src\/foo\.js/, result: { code: 0, stdout: 'diff --git a/src/foo.js b/src/foo.js\n+const x = 1;' } },
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
    // no ls-remote verify ever attempted AFTER the push failed -- the ref-existence
    // check (QF-20260904-693) runs once, upfront, before any staging/push work, so an
    // ls-remote call earlier in the sequence is expected and does not indicate a
    // post-failure verify was attempted.
    const pushIndex = gitRunner.mock.calls.findIndex((c) => c[0][0] === 'push');
    const lsRemoteAfterPush = gitRunner.mock.calls
      .slice(pushIndex + 1)
      .some((c) => c[0][0] === 'ls-remote');
    expect(lsRemoteAfterPush).toBe(false);
  });

  it('QF-20260911-379: a denylisted untracked identity file is never passed to git add', async () => {
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: 'untracked.txt\n.account-identity-last.json\n' } },
      { match: /^diff --cached --quiet/, result: { code: 0, stdout: '' } },
    ]);
    const logger = vi.fn();
    await runPreserveStage({ wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' }, { gitRunner, nowMs: NOW, logger });
    const addCall = gitRunner.mock.calls.find((c) => c[0][0] === 'add' && c[0][1] === '--');
    expect(addCall[0]).toEqual(['add', '--', 'untracked.txt']);
    expect(logger.mock.calls.some((c) => /refusing to stage denylisted.*account-identity-last/.test(c[0]))).toBe(true);
  });

  it('TS-5 (secret hit holds and never pushes): zero push invocations, verdict preserve_held_secret', async () => {
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 1, stdout: '' } },
      { match: /^diff --cached --name-only/, result: { code: 0, stdout: '.env.leak\n' } },
      { match: /^diff --cached -- \.env\.leak/, result: { code: 0, stdout: 'diff --git a/.env.leak b/.env.leak\n+SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI' } },
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

  it('QF-20260912-698: a per-file diff read that fails (simulated ENOBUFS/runner error) fails the WHOLE tree closed -- never commits an unscanned set', async () => {
    const logger = vi.fn();
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 1, stdout: '' } },
      { match: /^diff --cached --name-only/, result: { code: 0, stdout: 'a/clean.js\nb/huge-file.json\n' } },
      { match: /^diff --cached -- a\/clean\.js/, result: { code: 0, stdout: 'diff --git a/a/clean.js b/a/clean.js\n+ok;' } },
      // Simulates the real measured failure: a single file's diff read overflows the
      // runner's buffer and returns a nonzero code with truncated/empty stdout.
      { match: /^diff --cached -- b\/huge-file\.json/, result: { code: 1, stdout: '', stderr: 'ENOBUFS' } },
      { match: /^reset$/, result: { code: 0, stdout: '' } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW, logger }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.HELD_SECRET);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(false);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'push')).toBe(false);
    expect(gitRunner.mock.calls.some((c) => c[0].join(' ') === 'reset')).toBe(true);
    expect(logger.mock.calls.some((c) => /diff read failed.*b\/huge-file\.json.*failing closed/.test(c[0]))).toBe(true);
  });

  it('QF-20260912-698: a failed --name-only enumeration also fails closed (cannot scan what it cannot list)', async () => {
    const gitRunner = makeGitRunner([
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 1, stdout: '' } },
      { match: /^diff --cached --name-only/, result: { code: 1, stdout: '', stderr: 'simulated failure' } },
      { match: /^reset$/, result: { code: 0, stdout: '' } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.HELD_SECRET);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(false);
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

describe('runPreserveStage() skips a redundant push for an unchanged tip (QF-20260904-693)', () => {
  it('skips the push entirely when an existing wip/reclaim/<key>/* ref already points at the current HEAD', async () => {
    const sha = 'unchanged0tip0sha';
    const gitRunner = makeGitRunner([
      { match: /^rev-parse HEAD/, result: { code: 0, stdout: `${sha}\n` } },
      {
        match: /^ls-remote --heads origin wip\/reclaim\/foo\/\*/,
        result: { code: 0, stdout: `${sha}\trefs/heads/wip/reclaim/foo/2026-09-01T00-00-00-000Z\n` },
      },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
    expect(result.pushed).toBe(false);
    expect(result.sha).toBe(sha);
    expect(result.ref).toBe('wip/reclaim/foo/2026-09-01T00-00-00-000Z');
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'push')).toBe(false);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(false);
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'add')).toBe(false);
  });

  it('pushes a new ref when HEAD has moved past every existing wip/reclaim ref (moved tip)', async () => {
    const oldSha = 'old0tip0sha';
    const newSha = 'moved0tip0sha';
    const gitRunner = makeGitRunner([
      { match: /^rev-parse HEAD/, result: { code: 0, stdout: `${newSha}\n` } },
      {
        match: /^ls-remote --heads origin wip\/reclaim\/foo\/\*/,
        result: { code: 0, stdout: `${oldSha}\trefs/heads/wip/reclaim/foo/2026-09-01T00-00-00-000Z\n` },
      },
      { match: /^ls-files --others/, result: { code: 0, stdout: '' } },
      { match: /^diff --cached --quiet/, result: { code: 0, stdout: '' } }, // nothing staged
      { match: /^push origin/, result: { code: 0, stdout: '' } },
      { match: /^ls-remote origin refs\/heads/, result: { code: 0, stdout: `${newSha}\trefs/heads/wip/reclaim/foo\n` } },
    ]);

    const result = await runPreserveStage(
      { wtPath: '/repo/.worktrees/foo', key: 'foo', ownerSessionId: 's1' },
      { gitRunner, nowMs: NOW }
    );

    expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
    expect(result.pushed).toBe(true);
    expect(result.sha).toBe(newSha);
    expect(result.ref).not.toBe('wip/reclaim/foo/2026-09-01T00-00-00-000Z');
    expect(gitRunner.mock.calls.some((c) => c[0][0] === 'push')).toBe(true);
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
      if (/^diff --cached --name-only/.test(cmd)) return { code: 0, stdout: 'untracked.txt\n' };
      if (/^diff --cached -- untracked\.txt/.test(cmd)) return { code: 0, stdout: 'diff --git a/untracked.txt b/untracked.txt\n+const x = 1;' };
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
      if (/^diff --cached --name-only/.test(cmd)) return { code: 0, stdout: 'untracked.txt\n' };
      if (/^diff --cached -- untracked\.txt/.test(cmd)) return { code: 0, stdout: 'diff --git a/untracked.txt b/untracked.txt\n+const x = 1;' };
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
  it('QF-20260904-652: writes to quick_fixes.metadata.reaper_preserved[] for a QF-owned row, never overwriting other metadata', async () => {
    const existingRow = { id: 'QF-20260904-001', metadata: { other: 'field' } };
    let updatePayload = null;
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }) }),
        update: (payload) => { updatePayload = payload; return { eq: async () => ({ error: null }) }; },
      }),
    };

    const pointer = { ref: 'wip/reclaim/QF-20260904-001/ts', sha: 'abc' };
    const result = await appendReaperPreservedPointer(supabase, { key: 'QF-20260904-001', isQf: true }, pointer);

    expect(result).toEqual({ ok: true });
    expect(updatePayload.metadata.other).toBe('field');
    expect(updatePayload.metadata.reaper_preserved).toEqual([pointer]);
  });

  it('QF-20260904-652: fails soft on Postgres 42703 (column absent) on the read half, never throws', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42703', message: 'column "metadata" does not exist' } }) }) }),
      }),
    };
    const result = await appendReaperPreservedPointer(supabase, { key: 'QF-X', isQf: true }, { ref: 'r' });
    expect(result).toEqual({ ok: false, skipped: true, reason: 'column_absent' });
  });

  it('QF-20260904-652: fails soft on Postgres 42703 on the write half too', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'QF-X', metadata: {} }, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: { code: '42703', message: 'column "metadata" does not exist' } }) }),
      }),
    };
    const result = await appendReaperPreservedPointer(supabase, { key: 'QF-X', isQf: true }, { ref: 'r' });
    expect(result).toEqual({ ok: false, skipped: true, reason: 'column_absent' });
  });

  it('QF-20260904-652: skips (no throw) when no quick_fixes row matches the key', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    };
    const result = await appendReaperPreservedPointer(supabase, { key: 'QF-NOBODY', isQf: true }, { ref: 'r' });
    expect(result).toEqual({ ok: false, skipped: true, reason: 'no_matching_qf_id' });
  });

  it('appends to metadata.reaper_preserved[] for an SD row, never overwriting other metadata', async () => {
    const existingRow = { id: 'row-1', metadata: { other: 'field' }, updated_at: 't0' };
    let updatePayload = null;
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }) }),
        update: (payload) => { updatePayload = payload; return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'row-1' }, error: null }) }) }) }) }; },
      }),
    };

    const pointer = { ref: 'wip/reclaim/SD-X/ts', sha: 'abc' };
    const result = await appendReaperPreservedPointer(supabase, { key: 'SD-X', isQf: false }, pointer);

    expect(result.ok).toBe(true);
    expect(updatePayload.metadata.other).toBe('field');
    expect(updatePayload.metadata.reaper_preserved).toEqual([pointer]);
  });

  it('QF-20260904-652: skips (no throw) on a zero-match sd_key lookup instead of erroring on .single()', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    };
    const result = await appendReaperPreservedPointer(supabase, { key: 'chore/encode-1afdeaac-20260906', isQf: false }, { ref: 'r' });
    expect(result).toEqual({ ok: false, skipped: true, reason: 'no_matching_sd_key' });
  });

  it('retries on an optimistic-concurrency conflict (updated_at moved) then gives up after max retries', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'row-1', metadata: {}, updated_at: 't0' }, error: null }) }) }),
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

describe('splitCachedDiffByFile() (QF-20260912-495)', () => {
  it('splits a two-file diff on `diff --git a/... b/...` boundaries', () => {
    const diff = [
      'diff --git a/safe.txt b/safe.txt',
      '+safe line',
      'diff --git a/secret.json b/secret.json',
      '+"postgresql://user:pass@host:5432/db"',
    ].join('\n');
    const segments = splitCachedDiffByFile(diff);
    expect(segments).toEqual([
      { path: 'safe.txt', body: '+safe line' },
      { path: 'secret.json', body: '+"postgresql://user:pass@host:5432/db"' },
    ]);
  });

  it('falls back to one unpathed segment when no `diff --git` header is present', () => {
    expect(splitCachedDiffByFile('+bare content, no header')).toEqual([
      { path: null, body: '+bare content, no header' },
    ]);
  });
});

describe('scanStagedFilesForSecrets() (QF-20260912-495)', () => {
  it('flags only the matching file -- a postgresql:// connection string no longer holds the whole diff', () => {
    const diff = [
      'diff --git a/safe.txt b/safe.txt',
      '+const x = 1;',
      'diff --git a/.artifacts/unit-tier-results.json b/.artifacts/unit-tier-results.json',
      '+{"db": "postgresql://evaluser:s3cr3t@127.0.0.1:5432/app"}',
    ].join('\n');
    const results = scanStagedFilesForSecrets(diff);
    expect(results).toEqual([
      { path: 'safe.txt', held: false, findings: [] },
      { path: '.artifacts/unit-tier-results.json', held: true, findings: [{ id: 'DB-CONN-STRING', name: 'db_connection_string_with_password', matches: expect.any(Array) }] },
    ]);
  });

  it('a matching line in a TRACKED SOURCE file still holds that file (no change to the scan itself)', () => {
    const diff = [
      'diff --git a/lib/db-config.js b/lib/db-config.js',
      '+const url = "postgresql://admin:hunter2@prod-db:5432/app";',
    ].join('\n');
    expect(scanStagedFilesForSecrets(diff)[0].held).toBe(true);
  });
});

describe('withholdMatchedFiles() (QF-20260912-495)', () => {
  let wtPath, repoRoot;
  const ts = '2026-09-12T12-00-00-000Z';

  function mkTmp() {
    wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qf495-wt-'));
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf495-repo-'));
  }
  function rmTmp() {
    for (const d of [wtPath, repoRoot]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
  }

  it('moves the held file to the audit sink and deletes it from the tree', () => {
    mkTmp();
    try {
      const target = path.join(wtPath, '.artifacts', 'unit-tier-results.json');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '{"db":"postgresql://user:pass@host/db"}');

      const heldFiles = [{ path: '.artifacts/unit-tier-results.json', held: true, findings: [{ id: 'DB-CONN-STRING', name: 'db_connection_string_with_password' }] }];
      const result = withholdMatchedFiles({ wtPath, heldFiles, repoRoot, ts, logger: () => {} });

      expect(result.failed).toEqual([]);
      expect(result.withheld).toEqual([{ path: '.artifacts/unit-tier-results.json', pattern: 'db_connection_string_with_password' }]);
      expect(fs.existsSync(target)).toBe(false); // gone from the tree -- no longer reads dirty

      const sinkFile = path.join(repoRoot, 'scratch', `preserved-from-${path.basename(wtPath)}`, 'withheld', ts, '.artifacts', 'unit-tier-results.json');
      expect(fs.existsSync(sinkFile)).toBe(true);
      expect(fs.readFileSync(sinkFile, 'utf8')).toBe('{"db":"postgresql://user:pass@host/db"}');
    } finally { rmTmp(); }
  });

  it('a held file with no identifiable path (null) fails closed without touching the filesystem', () => {
    mkTmp();
    try {
      const result = withholdMatchedFiles({ wtPath, heldFiles: [{ path: null, held: true, findings: [{ name: 'x' }] }], repoRoot, ts, logger: () => {} });
      expect(result.withheld).toEqual([]);
      expect(result.failed).toEqual(['null']);
    } finally { rmTmp(); }
  });
});

describe('runPreserveStage() withholds matching files instead of holding the whole tree (QF-20260912-495)', () => {
  let wtPath, repoRoot;

  function mkTmp() {
    wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'qf495-wt-'));
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf495-repo-'));
  }
  function rmTmp() {
    for (const d of [wtPath, repoRoot]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
  }

  // makeGitRunner is first-match-wins and static -- withholding calls
  // `diff --cached --quiet` TWICE (the original probe, then a re-probe after matches
  // are relocated) expecting DIFFERENT results. This sequential variant returns the
  // next result in a rule's own list on each successive call to that rule.
  function makeSequentialGitRunner(rules) {
    const callIndex = new Map();
    return vi.fn((args) => {
      const cmd = args.join(' ');
      for (const r of rules) {
        if (r.match.test(cmd)) {
          const i = callIndex.get(r) || 0;
          callIndex.set(r, i + 1);
          const results = r.results;
          return results[Math.min(i, results.length - 1)];
        }
      }
      return { code: 0, stdout: '', stderr: '' };
    });
  }

  it('TS-e: one safe + one matching file -- the safe file proceeds to commit/push, the match is withheld, verdict PUSHED', async () => {
    mkTmp();
    try {
      const evidencePath = path.join(wtPath, '.artifacts', 'unit-tier-results.json');
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, '{"db":"postgresql://user:pass@host/db"}');

      const sha = 'safecommitsha';
      const gitRunner = makeSequentialGitRunner([
        { match: /^ls-files --others/, results: [{ code: 0, stdout: '' }] },
        { match: /^diff --cached --quiet$/, results: [{ code: 1, stdout: '' }, { code: 1, stdout: '' }] }, // staged before AND after (safe.js remains)
        { match: /^diff --cached --name-only$/, results: [{ code: 0, stdout: 'src/safe.js\n.artifacts/unit-tier-results.json\n' }] },
        { match: /^diff --cached -- src\/safe\.js$/, results: [{ code: 0, stdout: 'diff --git a/src/safe.js b/src/safe.js\n+const x = 1;' }] },
        { match: /^diff --cached -- \.artifacts\/unit-tier-results\.json$/, results: [{ code: 0, stdout: 'diff --git a/.artifacts/unit-tier-results.json b/.artifacts/unit-tier-results.json\n+{"db":"postgresql://user:pass@host/db"}' }] },
        { match: /^reset -- \.artifacts\/unit-tier-results\.json$/, results: [{ code: 0, stdout: '' }] },
        { match: /^commit/, results: [{ code: 0, stdout: '' }] },
        { match: /^push origin/, results: [{ code: 0, stdout: '' }] },
        { match: /^rev-parse HEAD/, results: [{ code: 0, stdout: `${sha}\n` }] },
        { match: /^ls-remote origin/, results: [{ code: 0, stdout: `${sha}\trefs/heads/wip/reclaim/foo\n` }] },
      ]);

      const result = await runPreserveStage(
        { wtPath, key: 'foo', ownerSessionId: 's1' },
        { gitRunner, nowMs: Date.parse('2026-09-12T12:00:00.000Z'), repoRoot, logger: () => {} }
      );

      expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
      expect(result.withheld).toEqual([{ path: '.artifacts/unit-tier-results.json', pattern: 'db_connection_string_with_password' }]);
      expect(fs.existsSync(evidencePath)).toBe(false);
      expect(gitRunner.mock.calls.some((c) => c[0].join(' ') === 'reset -- .artifacts/unit-tier-results.json')).toBe(true);
      expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(true);
    } finally { rmTmp(); }
  });

  it('TS-b: the safe subset is EMPTY after withholding (unpushed=0, dirty-only-unsafe) -- falls through to push-HEAD and reads reclaimable (verdict PUSHED)', async () => {
    mkTmp();
    try {
      const evidencePath = path.join(wtPath, '.artifacts', 'unit-tier-results.json');
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, '{"db":"postgresql://user:pass@host/db"}');

      const sha = 'headonlysha';
      const gitRunner = makeSequentialGitRunner([
        { match: /^ls-files --others/, results: [{ code: 0, stdout: '' }] },
        { match: /^diff --cached --quiet$/, results: [{ code: 1, stdout: '' }, { code: 0, stdout: '' }] }, // staged before, clean after withholding
        { match: /^diff --cached --name-only$/, results: [{ code: 0, stdout: '.artifacts/unit-tier-results.json\n' }] },
        { match: /^diff --cached -- \.artifacts\/unit-tier-results\.json$/, results: [{ code: 0, stdout: 'diff --git a/.artifacts/unit-tier-results.json b/.artifacts/unit-tier-results.json\n+{"db":"postgresql://user:pass@host/db"}' }] },
        { match: /^reset -- \.artifacts\/unit-tier-results\.json$/, results: [{ code: 0, stdout: '' }] },
        { match: /^push origin HEAD:/, results: [{ code: 0, stdout: '' }] },
        { match: /^rev-parse HEAD/, results: [{ code: 0, stdout: `${sha}\n` }] },
        { match: /^ls-remote origin/, results: [{ code: 0, stdout: `${sha}\trefs/heads/wip/reclaim/foo\n` }] },
      ]);

      const result = await runPreserveStage(
        { wtPath, key: 'foo', ownerSessionId: 's1' },
        { gitRunner, nowMs: Date.parse('2026-09-12T12:00:00.000Z'), repoRoot, logger: () => {} }
      );

      expect(result.verdict).toBe(PRESERVE_VERDICT.PUSHED);
      expect(gitRunner.mock.calls.some((c) => c[0][0] === 'commit')).toBe(false); // nothing left to commit
      expect(result.withheld).toEqual([{ path: '.artifacts/unit-tier-results.json', pattern: 'db_connection_string_with_password' }]);
    } finally { rmTmp(); }
  });
});
