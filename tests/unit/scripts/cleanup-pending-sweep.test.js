/**
 * tests/unit/scripts/cleanup-pending-sweep.test.js
 *
 * SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001
 * Coverage: FR-3 reaper consumer + FR-2c CAS + FR-2d phantom-path + module-load assertion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  assertCleanupPendingColumn,
  processCleanupPendingQueue,
} from '../../../scripts/cleanup-pending-sweep.mjs';

// ── Helpers ────────────────────────────────────────────────────────────

function makeFakeSupabase({
  rows = [],
  selectError = null,
  updateBehavior = 'success', // 'success' | 'lostRace' | 'error'
  insertError = null,
} = {}) {
  const calls = { selects: [], updates: [], inserts: [] };
  const fakeRows = [...rows];
  const supabase = {
    from(table) {
      const builder = {
        select(cols) {
          calls.selects.push({ table, cols });
          return {
            limit(n) {
              if (table === 'claude_sessions') {
                return Promise.resolve({ data: fakeRows.slice(0, n), error: selectError });
              }
              return Promise.resolve({ data: [], error: null });
            },
            not() {
              return {
                order() {
                  return {
                    limit(n) {
                      if (table === 'claude_sessions') {
                        return Promise.resolve({ data: fakeRows.slice(0, n), error: selectError });
                      }
                      return Promise.resolve({ data: [], error: null });
                    },
                    // residency-guard.js's heartbeatResidencyBlocksRemoval paginates via
                    // fetchAllPaginated (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6
                    // batch 8) — no session rows registered here, so an empty page ends the
                    // scan immediately (mirrors this mock's pre-conversion empty-data behavior).
                    range() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(payload) {
          calls.updates.push({ table, payload, eqs: [] });
          const updateChain = {
            eq(col, val) {
              calls.updates[calls.updates.length - 1].eqs.push({ col, val });
              return updateChain;
            },
            select() {
              if (updateBehavior === 'success') {
                return Promise.resolve({ data: [{ session_id: 'sess-cleared' }], error: null });
              }
              if (updateBehavior === 'lostRace') {
                return Promise.resolve({ data: [], error: null });
              }
              return Promise.resolve({ data: null, error: { message: 'fake DB error' } });
            },
          };
          return updateChain;
        },
        insert(row) {
          calls.inserts.push({ table, row });
          return Promise.resolve({ error: insertError });
        },
      };
      return builder;
    },
    _calls: calls,
    _setRows(newRows) { fakeRows.splice(0, fakeRows.length, ...newRows); },
  };
  return supabase;
}

// ── assertCleanupPendingColumn ─────────────────────────────────────────

describe('FR-3 module-load assertion: assertCleanupPendingColumn', () => {
  it('resolves silently when column exists', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              limit() { return Promise.resolve({ data: [], error: null }); },
            };
          },
        };
      },
    };
    await expect(assertCleanupPendingColumn(supabase)).resolves.toBeUndefined();
  });

  it('throws CLEANUP_PENDING_COLUMN_MISSING on PGRST204', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({
                  data: null,
                  error: { code: 'PGRST204', message: "column 'cleanup_pending' not found in schema cache" },
                });
              },
            };
          },
        };
      },
    };
    await expect(assertCleanupPendingColumn(supabase)).rejects.toMatchObject({
      code: 'CLEANUP_PENDING_COLUMN_MISSING',
    });
  });

  it('rethrows non-column-missing errors with cause', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({ data: null, error: { code: 'XXNET', message: 'network unreachable' } });
              },
            };
          },
        };
      },
    };
    await expect(assertCleanupPendingColumn(supabase)).rejects.toThrow(/assertion query failed/);
  });
});

// ── processCleanupPendingQueue ─────────────────────────────────────────

describe('FR-3 sweep: processCleanupPendingQueue', () => {
  let tmpDir;
  const realPath = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sd-sweep-test-'));

  beforeEach(() => {
    tmpDir = realPath();
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
    vi.restoreAllMocks();
  });

  it('returns zeros when no rows match', async () => {
    const supabase = makeFakeSupabase({ rows: [] });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5 });
    expect(summary.scanned).toBe(0);
    expect(summary.success).toBe(0);
  });

  it('FR-2d: phantom-path is detected and column cleared atomically', async () => {
    const phantom = path.join(os.tmpdir(), 'sd-sweep-phantom-' + Date.now());
    expect(fs.existsSync(phantom)).toBe(false);
    const supabase = makeFakeSupabase({
      rows: [{
        session_id: 'sess-phantom',
        sd_key: 'SD-PHANTOM-001',
        worktree_path: phantom,
        cleanup_pending: '2026-05-10T00:00:00Z',
        released_at: '2026-05-09T00:00:00Z',
      }],
    });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5 });
    expect(summary.scanned).toBe(1);
    expect(summary.phantom).toBe(1);
    expect(summary.success).toBe(0);
    // CAS UPDATE was issued
    expect(supabase._calls.updates.length).toBe(1);
    expect(supabase._calls.updates[0].payload.cleanup_pending).toBeNull();
    // Audit row emitted
    const phantomEvent = supabase._calls.inserts.find((i) => i.row.event_type === 'WORKTREE_CLEANUP_PHANTOM_PATH');
    expect(phantomEvent).toBeTruthy();
  });

  it('FR-3 happy path: real worktree → rm + CAS clear + SUCCESS event', async () => {
    // Create a fixture directory that fs.rmSync can really remove.
    const fixture = path.join(tmpDir, 'fake-worktree');
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(path.join(fixture, 'a.txt'), 'hello');

    const supabase = makeFakeSupabase({
      rows: [{
        session_id: 'sess-ok',
        sd_key: 'SD-OK-001',
        worktree_path: fixture,
        cleanup_pending: '2026-05-10T00:00:00Z',
        released_at: '2026-05-09T00:00:00Z',
      }],
    });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5 });
    expect(summary.success).toBe(1);
    expect(summary.exhausted).toBe(0);
    expect(summary.phantom).toBe(0);
    expect(fs.existsSync(fixture)).toBe(false);
    const successEvent = supabase._calls.inserts.find((i) => i.row.event_type === 'WORKTREE_CLEANUP_RETRY_SUCCESS');
    expect(successEvent).toBeTruthy();
  });

  it('FR-2c CAS race: lost-race emits LOST_RACE event, no double-fail', async () => {
    const fixture = path.join(tmpDir, 'race-fixture');
    fs.mkdirSync(fixture, { recursive: true });
    const supabase = makeFakeSupabase({
      rows: [{
        session_id: 'sess-race',
        sd_key: 'SD-RACE-001',
        worktree_path: fixture,
        cleanup_pending: '2026-05-10T00:00:00Z',
        released_at: '2026-05-09T00:00:00Z',
      }],
      updateBehavior: 'lostRace', // Simulates CAS guard returning 0 rows.
    });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5 });
    expect(summary.lostRace).toBe(1);
    expect(summary.success).toBe(0);
    const lostEvent = supabase._calls.inserts.find((i) => i.row.event_type === 'WORKTREE_CLEANUP_LOST_RACE');
    expect(lostEvent).toBeTruthy();
  });

  it('exhausted retries → RETRY_EXHAUSTED event, column NOT cleared', async () => {
    const fixture = path.join(tmpDir, 'exhausted-fixture');
    fs.mkdirSync(fixture, { recursive: true });

    // Mock fs.rmSync to fail forever so retry exhausts.
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      const err = new Error('EBUSY');
      err.code = 'EBUSY';
      throw err;
    });

    const supabase = makeFakeSupabase({
      rows: [{
        session_id: 'sess-exhausted',
        sd_key: 'SD-EXHAUSTED-001',
        worktree_path: fixture,
        cleanup_pending: '2026-05-10T00:00:00Z',
        released_at: '2026-05-09T00:00:00Z',
      }],
    });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5 });
    expect(summary.exhausted).toBe(1);
    expect(summary.success).toBe(0);
    expect(supabase._calls.updates.length).toBe(0); // NO column clear
    const exhaustedEvent = supabase._calls.inserts.find((i) => i.row.event_type === 'WORKTREE_CLEANUP_RETRY_EXHAUSTED');
    expect(exhaustedEvent).toBeTruthy();
  });

  it('dry-run skips fs ops AND DB UPDATE for both phantom + real paths', async () => {
    const fixture = path.join(tmpDir, 'dryrun-real');
    fs.mkdirSync(fixture, { recursive: true });
    const phantomPath = path.join(tmpDir, 'dryrun-phantom-does-not-exist');
    const supabase = makeFakeSupabase({
      rows: [
        {
          session_id: 'sess-dr-real',
          sd_key: 'SD-DR-1',
          worktree_path: fixture,
          cleanup_pending: '2026-05-10T00:00:00Z',
          released_at: '2026-05-09T00:00:00Z',
        },
        {
          session_id: 'sess-dr-phantom',
          sd_key: 'SD-DR-2',
          worktree_path: phantomPath,
          cleanup_pending: '2026-05-10T00:00:00Z',
          released_at: '2026-05-09T00:00:00Z',
        },
      ],
    });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5, dryRun: true });
    expect(summary.scanned).toBe(2);
    expect(summary.phantom).toBe(1);
    expect(summary.success).toBe(0);
    expect(summary.exhausted).toBe(0);
    // Real fixture should NOT have been removed.
    expect(fs.existsSync(fixture)).toBe(true);
    // No UPDATEs in dry-run mode.
    expect(supabase._calls.updates.length).toBe(0);
  });

  it('handles select error gracefully', async () => {
    const supabase = makeFakeSupabase({
      rows: [],
      selectError: { message: 'connection refused', code: 'ECONNREFUSED' },
    });
    const summary = await processCleanupPendingQueue(supabase, { batch: 5 });
    expect(summary.dbError).toBeGreaterThan(0);
    expect(summary.errors.length).toBeGreaterThan(0);
  });
});
