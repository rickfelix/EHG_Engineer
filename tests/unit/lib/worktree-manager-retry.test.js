/**
 * tests/unit/lib/worktree-manager-retry.test.js
 *
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001
 * Coverage: FR-1 retry helper + FR-2 writer + FR-1c CJS parity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  safeRecursiveRm,
  safeRecursiveRmWithRetry,
  markCleanupPendingBestEffort,
} from '../../../lib/worktree-manager.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

// ── safeRecursiveRmWithRetry ───────────────────────────────────────────

describe('FR-1: safeRecursiveRmWithRetry', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cleanup-test-'));
  });

  afterEach(() => {
    try { safeRecursiveRm(tmpDir); } catch { /* fine */ }
    vi.restoreAllMocks();
  });

  it('returns ok=true on first attempt for an empty directory', () => {
    const result = safeRecursiveRmWithRetry(tmpDir, { delaysMs: [10, 10, 10] });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.lastError).toBeNull();
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('returns ok=true on first attempt when path does not exist (ENOENT-benign)', () => {
    safeRecursiveRm(tmpDir); // delete first
    const result = safeRecursiveRmWithRetry(tmpDir, { delaysMs: [10, 10, 10] });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('retries up to 3 times (default delaysMs schedule)', () => {
    // Spy on fs.rmSync to count invocations.
    let calls = 0;
    const origRmSync = fs.rmSync;
    const spy = vi.spyOn(fs, 'rmSync').mockImplementation((...args) => {
      calls++;
      if (calls < 3) {
        const err = new Error('EBUSY: resource busy or locked');
        err.code = 'EBUSY';
        throw err;
      }
      return origRmSync(...args);
    });
    const result = safeRecursiveRmWithRetry(tmpDir, { delaysMs: [10, 10, 10] });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('returns ok=false after 3 attempts of persistent EPERM', () => {
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      const err = new Error('EPERM: operation not permitted');
      err.code = 'EPERM';
      throw err;
    });
    const result = safeRecursiveRmWithRetry(tmpDir, { delaysMs: [10, 10, 10] });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.lastError).toMatch(/EPERM|permitted/);
  });

  it('uses default schedule [100,500,2000] when delaysMs not provided', () => {
    // Verify schedule is the canonical [100, 500, 2000] mirroring rollbackWorktreeFilesystemSync.
    // We cannot easily measure timing in unit test (would slow suite by 2.6s),
    // so instead assert the function source contains the literal default.
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'lib', 'worktree-manager.js'),
      'utf8'
    );
    expect(src).toMatch(/\[100,\s*500,\s*2000\]/);
  });

  it('treats ENOENT mid-retry as success', () => {
    let calls = 0;
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      calls++;
      if (calls === 1) {
        const err = new Error('EBUSY');
        err.code = 'EBUSY';
        throw err;
      }
      const err = new Error('ENOENT: no such file');
      err.code = 'ENOENT';
      throw err;
    });
    const result = safeRecursiveRmWithRetry(tmpDir, { delaysMs: [5, 5, 5] });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });
});

// ── markCleanupPendingBestEffort ───────────────────────────────────────

describe('FR-2 writer: markCleanupPendingBestEffort', () => {
  function makeFakeSupabase({ existingRow = null, updateError = null, insertError = null } = {}) {
    const calls = { selects: [], updates: [], inserts: [] };
    const supabase = {
      from(table) {
        return {
          select(cols) {
            calls.selects.push({ table, cols });
            return {
              eq() { return this; },
              not() { return this; },
              order() { return this; },
              limit() {
                if (table === 'claude_sessions') {
                  return Promise.resolve({ data: existingRow ? [existingRow] : [], error: null });
                }
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
          update(payload) {
            calls.updates.push({ table, payload });
            return {
              eq() {
                return Promise.resolve({ error: updateError });
              },
            };
          },
          insert(row) {
            calls.inserts.push({ table, row });
            return Promise.resolve({ error: insertError });
          },
        };
      },
      _calls: calls,
    };
    return supabase;
  }

  it('returns marked=true on successful UPDATE', async () => {
    const supabase = makeFakeSupabase({
      existingRow: {
        session_id: 'sess-1',
        released_at: new Date().toISOString(),
        worktree_path: '/tmp/worktree',
        cleanup_pending: null,
      },
    });
    const result = await markCleanupPendingBestEffort('SD-TEST-001', { supabase });
    expect(result.marked).toBe(true);
    expect(result.sessionId).toBe('sess-1');
    expect(supabase._calls.updates.length).toBe(1);
    expect(supabase._calls.updates[0].payload.cleanup_pending).toBeTruthy();
  });

  it('returns marked=false reason=no_released_session_for_sd_key when no match', async () => {
    const supabase = makeFakeSupabase({ existingRow: null });
    const result = await markCleanupPendingBestEffort('SD-MISSING-001', { supabase });
    expect(result.marked).toBe(false);
    expect(result.reason).toBe('no_released_session_for_sd_key');
  });

  it('returns reason=already_pending when cleanup_pending already set', async () => {
    const supabase = makeFakeSupabase({
      existingRow: {
        session_id: 'sess-2',
        released_at: new Date().toISOString(),
        worktree_path: '/tmp/x',
        cleanup_pending: new Date().toISOString(),
      },
    });
    const result = await markCleanupPendingBestEffort('SD-TEST-002', { supabase });
    expect(result.marked).toBe(false);
    expect(result.reason).toBe('already_pending');
    expect(supabase._calls.updates.length).toBe(0);
  });

  it('graceful degrade on PGRST204 column-missing — falls back to audit row', async () => {
    const supabase = makeFakeSupabase({
      existingRow: {
        session_id: 'sess-3',
        released_at: new Date().toISOString(),
        worktree_path: '/tmp/y',
        cleanup_pending: null,
      },
      updateError: { code: 'PGRST204', message: "column 'cleanup_pending' not found in schema cache" },
    });
    const result = await markCleanupPendingBestEffort('SD-TEST-003', {
      supabase,
      worktreePath: '/tmp/y',
      attempts: 3,
      lastError: 'EBUSY',
    });
    expect(result.marked).toBe(false);
    expect(result.reason).toBe('column_missing');
    // Audit row inserted as fallback
    expect(supabase._calls.inserts.length).toBe(1);
    expect(supabase._calls.inserts[0].table).toBe('session_lifecycle_events');
    expect(supabase._calls.inserts[0].row.event_type).toBe('WORKTREE_ROLLBACK_DEFERRED');
    expect(supabase._calls.inserts[0].row.reason).toBe('cleanup_pending_column_missing');
  });

  it('returns reason=missing_sd_key on null/empty input', async () => {
    const result = await markCleanupPendingBestEffort('', {});
    expect(result.marked).toBe(false);
    expect(result.reason).toBe('missing_sd_key');
  });
});

// ── FR-1c: CJS hook parity ─────────────────────────────────────────────

describe('FR-1c: CJS hook retry schedule parity', () => {
  it('CJS hook embeds the same delaysMs schedule as ESM helper', () => {
    const cjsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts', 'hooks', 'concurrent-session-worktree.cjs'),
      'utf8'
    );
    // ESM helper: [100, 500, 2000]. CJS hook MUST embed the same schedule.
    expect(cjsSrc).toMatch(/CJS_RETRY_DELAYS_MS\s*=\s*\[100,\s*500,\s*2000\]/);
  });

  it('CJS hook handles ENOENT as benign (terminates loop early)', () => {
    const cjsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts', 'hooks', 'concurrent-session-worktree.cjs'),
      'utf8'
    );
    // Look for the ENOENT-benign check inside the retry loop.
    expect(cjsSrc).toMatch(/rmErr\.code\s*===\s*['"]ENOENT['"][\s\S]*?rmOk\s*=\s*true/);
  });

  it('CJS hook emits structured log on persistent failure', () => {
    const cjsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts', 'hooks', 'concurrent-session-worktree.cjs'),
      'utf8'
    );
    expect(cjsSrc).toContain('session.stale_cleanup_deferred');
  });
});

// ── FR-1: 4 ad-hoc sites are routed through retry helper ──────────────

describe('FR-1: 4 ad-hoc safeRecursiveRm sites routed through safeRecursiveRmWithRetry', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'lib', 'worktree-manager.js'),
    'utf8'
  );

  it('symlinkNodeModules cleanup uses safeRecursiveRmWithRetry (FR-1 site #1)', () => {
    expect(src).toMatch(/symlinkNodeModules[\s\S]*?safeRecursiveRmWithRetry\(targetModules\)/);
  });

  it('removeWorktree fallback uses safeRecursiveRmWithRetry + markCleanupPendingBestEffort (FR-1 site #2)', () => {
    // removeWorktree's catch block must contain the retry helper call AND the FR-2 mark.
    const block = src.match(/export function removeWorktree[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('safeRecursiveRmWithRetry(worktreePath)');
    expect(block[0]).toContain('markCleanupPendingBestEffort(sdKey');
  });

  it('_archiveWorktreeDir uses safeRecursiveRmWithRetry + markCleanupPendingBestEffort (FR-1 site #3)', () => {
    const block = src.match(/function _archiveWorktreeDir[\s\S]*?return \{ archived: true/);
    expect(block).not.toBeNull();
    expect(block[0]).toContain('safeRecursiveRmWithRetry(wtPath)');
    expect(block[0]).toContain('markCleanupPendingBestEffort(sdKey');
  });

  it('cleanupOrphans inner-loop fallback uses safeRecursiveRmWithRetry + markCleanupPendingBestEffort (FR-1 site #4)', () => {
    // The cleanupOrphans function applies retry + mark for each item.key.
    expect(src).toMatch(/safeRecursiveRmWithRetry\(item\.path\)/);
    expect(src).toMatch(/markCleanupPendingBestEffort\(item\.key/);
  });

  it('NO direct safeRecursiveRm call sites remain in the 4 patched locations', () => {
    // The retry helper is the contract; non-retry safeRecursiveRm should only appear
    // inside the helper definition itself or inside rollbackWorktreeFilesystemSync (which
    // already has its own retry envelope). All NEW code paths must go through the retry helper.
    // Count direct safeRecursiveRm calls outside retry helpers.
    const lines = src.split('\n');
    const directCalls = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (/^\s*\*|^\s*\/\//.test(line)) continue;
      // Match safeRecursiveRm( — but exclude declarations
      if (/\bsafeRecursiveRm\(/.test(line) && !/export function safeRecursiveRm\b/.test(line)) {
        directCalls.push({ lineNum: i + 1, content: line.trim() });
      }
    }
    // Expected sites:
    //   - line ~508 inside rollbackWorktreeFilesystemSync (covered by its own retry)
    //   - inside safeRecursiveRmWithRetry implementation (the helper itself)
    // Plus cleanup-pending-sweep imports the helper but doesn't call safeRecursiveRm directly.
    // No new direct call sites should appear.
    const allowedContexts = directCalls.filter((c) => {
      // Allowed: inside rollbackWorktreeFilesystemSync (line range ~480-525), inside
      // safeRecursiveRmWithRetry (line range varies, but it's the helper).
      return (c.content.includes('safeRecursiveRm(targetPath') ||  // helper internal
              c.content.includes('safeRecursiveRm(worktreePath, { force: true })')); // rollback site
    });
    const unexpected = directCalls.filter((c) => !allowedContexts.includes(c));
    expect(
      unexpected.map((c) => `line ${c.lineNum}: ${c.content}`),
      'New direct safeRecursiveRm call site detected — should route through safeRecursiveRmWithRetry'
    ).toEqual([]);
  });
});
