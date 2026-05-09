/**
 * Unit test: rollbackWorktreeCreation emits WORKTREE_BRUTE_FORCE_FALLBACK_OK
 * to session_lifecycle_events when the brute-force fallback rescues a worktree
 * that `git worktree remove --force` refused to delete.
 *
 * QF-20260509-235 — closes the observability gap from
 * SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001 testing-agent finding #7.
 *
 * Strategy: inject a mock Supabase + a temp git repo + a locked worktree.
 * Assert the success path inserts a session_lifecycle_events row with the
 * expected event_type and metadata.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { rollbackWorktreeCreation } from '../../../lib/worktree-manager.js';

const TMP_BASE = path.join(os.tmpdir(), `wt-brute-tel-${crypto.randomUUID().slice(0, 8)}`);

function safeRm(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function buildMockSupabase() {
  const inserts = [];
  const supabase = {
    from: vi.fn().mockImplementation((table) => ({
      insert: vi.fn().mockImplementation((row) => {
        inserts.push({ table, row });
        return { select: vi.fn().mockResolvedValue({ data: [row], error: null }) };
      }),
    })),
  };
  return { supabase, inserts };
}

describe('rollbackWorktreeCreation — brute-force success telemetry (QF-20260509-235)', () => {
  let env;

  beforeAll(() => {
    fs.mkdirSync(TMP_BASE, { recursive: true });
    const repoRoot = path.join(TMP_BASE, 'repo');
    const worktreePath = path.join(TMP_BASE, 'worktree');
    fs.mkdirSync(repoRoot, { recursive: true });
    execSync('git init -q', { cwd: repoRoot, stdio: 'pipe' });
    execSync('git config user.email test@example.com', { cwd: repoRoot, stdio: 'pipe' });
    execSync('git config user.name Test', { cwd: repoRoot, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoRoot, 'README.md'), '# test\n');
    execSync('git add README.md', { cwd: repoRoot, stdio: 'pipe' });
    execSync('git commit -q -m init', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git worktree add -q -b brute-tel-test "${worktreePath}"`, { cwd: repoRoot, stdio: 'pipe' });
    // Force git worktree remove to fail via .locked file
    const wtName = path.basename(worktreePath);
    fs.writeFileSync(
      path.join(repoRoot, '.git', 'worktrees', wtName, 'locked'),
      'forcing brute-force fallback for telemetry test\n'
    );
    env = { repoRoot, worktreePath };
  });

  afterAll(() => safeRm(TMP_BASE));

  it('emits WORKTREE_BRUTE_FORCE_FALLBACK_OK with correct shape on brute-force success', async () => {
    const { supabase, inserts } = buildMockSupabase();

    const result = await rollbackWorktreeCreation(env.worktreePath, 'test-session-001', {
      repoRoot: env.repoRoot,
      supabase,
      delaysMs: [10],
      originalError: new Error('test rollback context'),
    });

    expect(result.ok).toBe(true);
    expect(result.deferred).toBe(false);

    const evRows = inserts.filter((i) => i.table === 'session_lifecycle_events');
    expect(evRows.length).toBeGreaterThanOrEqual(1);

    const successEvent = evRows.find((i) => i.row.event_type === 'WORKTREE_BRUTE_FORCE_FALLBACK_OK');
    expect(successEvent, 'no WORKTREE_BRUTE_FORCE_FALLBACK_OK event was emitted').toBeDefined();
    expect(successEvent.row.session_id).toBe('test-session-001');
    expect(successEvent.row.reason).toBe('git_worktree_remove_refused_brute_force_rescued');
    expect(successEvent.row.metadata).toBeDefined();
    expect(successEvent.row.metadata.path).toBe(env.worktreePath);
    expect(successEvent.row.metadata.original_error).toBe('test rollback context');
    expect(successEvent.row.metadata.attempts_made).toBeGreaterThanOrEqual(1);
    // last_error is the failed-git-worktree-remove message, not null on this path
    expect(successEvent.row.metadata.last_error).not.toBeNull();
  });
});
