/**
 * QF-20260901-005 — DB-status bypass for the orphan sweep's content-cap refusal.
 *
 * The sweep refused 26/26 reapable candidates on `high_content`/`cap_exceeded` even though
 * their SD/QF was already `completed`/`cancelled` — a real node_modules copy tripped the
 * content probe's cap, but the DB status is the evidence the work is done, not the tree's
 * byte count. These tests cover the two pure/async pieces of that bypass in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { partitionBypassableRefusals, fetchTerminalStatusKeys, runOrphanSweep } from '../../../lib/worktree-reaper/orphan-sweep.js';
import { REASON, CONTENT_REFUSE_MIN_FILES } from '../../../lib/worktree-reaper/orphan-content-probe.mjs';

describe('partitionBypassableRefusals', () => {
  it('bypasses high_content when the resolved key is DB-terminal', () => {
    const refused = [{ dir: 'qf/QF-DONE-1', full: '/x/qf/QF-DONE-1', reason: REASON.HIGH_CONTENT, files: 500 }];
    const { bypassed, stillRefused } = partitionBypassableRefusals(refused, new Set(['QF-DONE-1']));
    expect(bypassed).toEqual([{ dir: 'qf/QF-DONE-1', full: '/x/qf/QF-DONE-1', dbStatusBypass: true }]);
    expect(stillRefused).toEqual([]);
  });

  it('bypasses cap_exceeded the same way', () => {
    const refused = [{ dir: 'sd/SD-DONE-1', full: '/x/sd/SD-DONE-1', reason: REASON.CAP_EXCEEDED, files: 5000 }];
    const { bypassed } = partitionBypassableRefusals(refused, new Set(['SD-DONE-1']));
    expect(bypassed).toHaveLength(1);
  });

  it('never bypasses walk_timeout or walk_error, even when the key is terminal (FR-3b)', () => {
    const refused = [
      { dir: 'qf/QF-DONE-2', full: '/x/qf/QF-DONE-2', reason: REASON.WALK_TIMEOUT },
      { dir: 'qf/QF-DONE-3', full: '/x/qf/QF-DONE-3', reason: REASON.WALK_ERROR },
    ];
    const { bypassed, stillRefused } = partitionBypassableRefusals(refused, new Set(['QF-DONE-2', 'QF-DONE-3']));
    expect(bypassed).toEqual([]);
    expect(stillRefused).toHaveLength(2);
  });

  it('leaves a content refusal refused when its key is not in terminalStatusKeys', () => {
    const refused = [{ dir: 'qf/QF-LIVE-1', full: '/x/qf/QF-LIVE-1', reason: REASON.HIGH_CONTENT }];
    const { bypassed, stillRefused } = partitionBypassableRefusals(refused, new Set());
    expect(bypassed).toEqual([]);
    expect(stillRefused).toHaveLength(1);
  });

  it('resolves the key from a flat-layout dir with no typed prefix', () => {
    const refused = [{ dir: 'QF-DONE-4', full: '/x/QF-DONE-4', reason: REASON.HIGH_CONTENT }];
    const { bypassed } = partitionBypassableRefusals(refused, new Set(['QF-DONE-4']));
    expect(bypassed).toHaveLength(1);
  });
});

describe('fetchTerminalStatusKeys', () => {
  it('returns an empty set with no supabase client (fail closed)', async () => {
    const result = await fetchTerminalStatusKeys(null, ['SD-X']);
    expect(result.size).toBe(0);
  });

  it('returns an empty set for an empty key list', async () => {
    const supabase = { from: vi.fn() };
    const result = await fetchTerminalStatusKeys(supabase, []);
    expect(result.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('queries strategic_directives_v2 for SD- keys and quick_fixes for QF- keys, keeping only terminal statuses', async () => {
    const supabase = {
      from: vi.fn((table) => ({
        select: () => ({
          in: () => ({
            limit: async () => {
              if (table === 'strategic_directives_v2') {
                return { data: [{ sd_key: 'SD-DONE', status: 'completed' }, { sd_key: 'SD-LIVE', status: 'executing' }] };
              }
              if (table === 'quick_fixes') {
                return { data: [{ id: 'QF-DONE', status: 'cancelled' }, { id: 'QF-LIVE', status: 'in_progress' }] };
              }
              return { data: [] };
            },
          }),
        }),
      })),
    };
    const result = await fetchTerminalStatusKeys(supabase, ['SD-DONE', 'SD-LIVE', 'QF-DONE', 'QF-LIVE']);
    expect(result).toEqual(new Set(['SD-DONE', 'QF-DONE']));
  });

  it('fails closed to an empty set when the DB call throws', async () => {
    const supabase = { from: () => ({ select: () => ({ in: () => ({ limit: async () => { throw new Error('db down'); } }) }) }) };
    const result = await fetchTerminalStatusKeys(supabase, ['SD-DONE']);
    expect(result.size).toBe(0);
  });
});

describe('runOrphanSweep + resolveTerminalStatusKeys (end-to-end, real fs)', () => {
  let root, worktreesDir;

  function mkHeavyOrphan(name) {
    const dir = path.join(worktreesDir, name);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < CONTENT_REFUSE_MIN_FILES + 1; i += 1) {
      fs.writeFileSync(path.join(dir, `f${i}.txt`), 'x'.repeat(50));
    }
    const when = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const e of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, e), when, when);
    fs.utimesSync(dir, when, when);
    return dir;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-sweep-dbstatus-'));
    worktreesDir = path.join(root, '.worktrees');
    fs.mkdirSync(worktreesDir, { recursive: true });
  });

  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ } });

  it('reclassifies a high_content refusal as reapable when its key resolves to a terminal DB status', async () => {
    mkHeavyOrphan('QF-DONE-5');
    const result = await runOrphanSweep({
      worktreesDir,
      minAgeMs: 30 * 60 * 1000,
      resolveTerminalStatusKeys: async (keys) => new Set(keys.includes('QF-DONE-5') ? ['QF-DONE-5'] : []),
    });
    expect(result.summary.refused_count).toBe(0);
    expect(result.summary.reapable).toBe(1);
  });

  it('leaves a high_content refusal refused when the DB status never resolves to terminal', async () => {
    mkHeavyOrphan('QF-LIVE-5');
    const result = await runOrphanSweep({
      worktreesDir,
      minAgeMs: 30 * 60 * 1000,
      resolveTerminalStatusKeys: async () => new Set(),
    });
    expect(result.summary.refused_count).toBe(1);
    expect(result.summary.refused[0].reason).toBe(REASON.HIGH_CONTENT);
  });
});
