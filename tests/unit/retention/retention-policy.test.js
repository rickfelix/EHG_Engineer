/**
 * SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001 — policy registry + enforcement invariants.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  RETENTION_POLICIES, SOAK_ENTRIES, effectiveHotDays, cutoffIso,
  MIN_HOT_DAYS, DEFAULT_HOT_DAYS,
} from '../../../lib/retention/policies.js';
import { enforcePolicy, rotateDaemonLog } from '../../../scripts/retention-enforce.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');

describe('policy registry (TS-1)', () => {
  it('registers all 10 unbounded tables with the VERIFIED timestamp columns', () => {
    const m = Object.fromEntries(RETENTION_POLICIES.map((p) => [p.table, p.timestampColumn]));
    expect(m).toEqual({
      workflow_trace_log: 'created_at',
      governance_audit_log: 'changed_at',
      audit_log: 'created_at',
      validation_audit_log: 'created_at',
      model_usage_log: 'captured_at',
      permission_audit_log: 'created_at',
      // SD-REFILL-00LHUVME: eva_scheduler_metrics retention coverage
      eva_scheduler_metrics: 'created_at',
      // SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 FR-3
      sub_agent_execution_results: 'created_at',
      // SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001: sms_inbound_log retention coverage
      sms_inbound_log: 'created_at',
      // SD-LEO-INFRA-HOLD-STATE-CONTRACT-001: hold_state_contract_violations retention coverage
      hold_state_contract_violations: 'created_at',
    });
  });

  it('eva_scheduler_metrics policy uses the safe defaults (SD-REFILL-00LHUVME)', () => {
    const p = RETENTION_POLICIES.find((x) => x.table === 'eva_scheduler_metrics');
    expect(p).toBeDefined();
    expect(p.timestampColumn).toBe('created_at');
    expect(p.mode).toBe('archive');
    expect(effectiveHotDays(p, {})).toBe(DEFAULT_HOT_DAYS);
    // floor still protects readers
    expect(() => effectiveHotDays(p, { RETENTION_HOT_DAYS_EVA_SCHEDULER_METRICS: '30' }))
      .toThrow(/below the MIN_HOT_DAYS floor/);
  });

  it('default window is 90d (3x the 30d longest consumer lookback)', () => {
    expect(DEFAULT_HOT_DAYS).toBe(90);
    for (const p of RETENTION_POLICIES) expect(effectiveHotDays(p, {})).toBe(90);
  });

  it('floor assert: a window below MIN_HOT_DAYS refuses to run', () => {
    const p = RETENTION_POLICIES[0];
    expect(() => effectiveHotDays(p, { [`RETENTION_HOT_DAYS_${p.table.toUpperCase()}`]: '30' }))
      .toThrow(/below the MIN_HOT_DAYS floor/);
    expect(MIN_HOT_DAYS).toBeGreaterThan(30); // must exceed the longest consumer lookback
  });

  it('env override above the floor is honored', () => {
    const p = RETENTION_POLICIES[0];
    expect(effectiveHotDays(p, { [`RETENTION_HOT_DAYS_${p.table.toUpperCase()}`]: '120' })).toBe(120);
  });

  it('cutoff math: 90d before now', () => {
    const now = new Date('2026-06-10T00:00:00Z');
    const iso = cutoffIso(RETENTION_POLICIES[0], now, {});
    expect(iso).toBe(new Date(now.getTime() - 90 * 86_400_000).toISOString());
  });

  it('the quarantine soak entry is report-only (no archive mode)', () => {
    expect(SOAK_ENTRIES).toHaveLength(1);
    expect(SOAK_ENTRIES[0].table).toBe('management_reviews_quarantine_20260610');
    expect(SOAK_ENTRIES[0].mode).toBe('soak_until');
    // and it is NOT in the executable policy list
    expect(RETENTION_POLICIES.some((p) => p.table === SOAK_ENTRIES[0].table)).toBe(false);
  });
});

// ── mock supabase builder helper ──
function mockSupabase({ eligible = 5, rows = null, insertError = null, deleteError = null, alreadyArchivedIds = [] } = {}) {
  const calls = { inserts: 0, deletes: 0 };
  const sampleRows = rows || Array.from({ length: eligible }, (_, i) => ({ id: `id-${i}`, created_at: '2026-01-01T00:00:00Z' }));
  const from = vi.fn((table) => {
    if (table === 'retention_archive') {
      return {
        insert: vi.fn(async (rowsIn) => {
          calls.inserts += 1;
          if (insertError) return { error: { message: insertError }, count: null };
          return { error: null, count: rowsIn.length };
        }),
        // FR-6b id-cursor dedup check
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: alreadyArchivedIds.map((id) => ({ source_id: String(id) })),
              error: null,
            })),
          })),
        })),
      };
    }
    // source table builder — chainable
    const builder = {
      select: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: sampleRows, error: null })),
      delete: vi.fn(() => ({
        in: vi.fn(async () => {
          calls.deletes += 1;
          if (deleteError) return { error: { message: deleteError } };
          return { error: null };
        }),
      })),
    };
    // count query: select(head:true) path resolves via then on builder — emulate with a thenable
    builder.then = undefined;
    builder.select = vi.fn((sel, opts) => {
      if (opts && opts.head) {
        return { lt: vi.fn(async () => ({ count: eligible, error: null })) };
      }
      return builder;
    });
    return builder;
  });
  return { supabase: { from }, calls };
}

describe('enforcement invariants (TS-3/TS-4)', () => {
  const policy = { table: 'audit_log', timestampColumn: 'created_at', hotDays: 90, mode: 'archive', perRunCap: 10 };

  it('dry-run counts but never selects/inserts/deletes rows', async () => {
    const { supabase, calls } = mockSupabase({ eligible: 7 });
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.eligible).toBe(7);
    expect(r.archived).toBe(0);
    expect(r.deleted).toBe(0);
    expect(calls.inserts).toBe(0);
    expect(calls.deletes).toBe(0);
  });

  it('apply archives THEN deletes; counts reconcile', async () => {
    const { supabase, calls } = mockSupabase({ eligible: 5 });
    const r = await enforcePolicy(supabase, policy, { apply: true, env: {} });
    expect(r.error).toBeNull();
    expect(r.archived).toBe(5);
    expect(r.deleted).toBe(5);
    expect(calls.inserts).toBeGreaterThan(0);
    expect(calls.deletes).toBeGreaterThan(0);
  });

  it('TS-4: a FAILED archive insert issues ZERO deletes (archive-before-delete invariant)', async () => {
    const { supabase, calls } = mockSupabase({ eligible: 5, insertError: 'boom' });
    const r = await enforcePolicy(supabase, policy, { apply: true, env: {} });
    expect(r.error).toMatch(/archive insert failed/);
    expect(r.deleted).toBe(0);
    expect(calls.deletes).toBe(0);
  });

  it('a failed delete AFTER archive reports the rows as archived (rerun converges)', async () => {
    const { supabase } = mockSupabase({ eligible: 5, deleteError: 'net blip' });
    const r = await enforcePolicy(supabase, policy, { apply: true, env: {} });
    expect(r.error).toMatch(/delete failed after archive/);
    expect(r.archived).toBe(5);
  });

  it('FR-6b id-cursor: ids already archived by a prior failed-delete run are NOT re-archived, only re-deleted', async () => {
    const { supabase, calls } = mockSupabase({ eligible: 5, alreadyArchivedIds: ['id-0', 'id-1'] });
    const r = await enforcePolicy(supabase, policy, { apply: true, env: {} });
    expect(r.error).toBeNull();
    // Only the 3 NOT-already-archived ids get inserted into retention_archive...
    expect(r.archived).toBe(3);
    // ...but all 5 (including the 2 already-archived) are retried for delete.
    expect(r.deleted).toBe(5);
    expect(calls.inserts).toBe(1);
  });

  it('per-table fail-soft: enforcePolicy returns the error rather than throwing', async () => {
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ lt: vi.fn(async () => ({ count: null, error: { message: 'table gone' } })) })) })) };
    const r = await enforcePolicy(supabase, policy, { apply: false, env: {} });
    expect(r.error).toMatch(/count failed/);
  });
});

describe('migration parity (TS-2 static)', () => {
  const UP = readFileSync(resolve(REPO_ROOT, 'database/migrations/20260610_retention_substrate.sql'), 'utf8');
  const DOWN = readFileSync(resolve(REPO_ROOT, 'database/migrations/20260610_retention_substrate_DOWN.sql'), 'utf8');

  it('UP creates exactly the two substrate tables; DOWN drops exactly those two', () => {
    expect((UP.match(/CREATE TABLE IF NOT EXISTS (retention_archive|retention_runs)/g) || []).length).toBe(2);
    expect((DOWN.match(/DROP TABLE IF EXISTS (retention_archive|retention_runs)/g) || []).length).toBe(2);
    expect(UP).not.toMatch(/ALTER TABLE (workflow_trace_log|governance_audit_log|audit_log|validation_audit_log|model_usage_log|permission_audit_log)/);
    // anchor on the STATEMENT form — the safety comments legitimately mention "delete"
    expect(UP).not.toMatch(/DELETE\s+FROM/i);
    expect(UP).not.toMatch(/TRUNCATE/i);
  });

  it('liveness contract documented at the table (age-keyed, not status)', () => {
    expect(UP).toMatch(/alarm on AGE of max\(ran_at\), never on self-reported status/);
  });
});

describe('log rotation (FR-5)', () => {
  it('absent log file is a no-op', () => {
    const r = rotateDaemonLog('/nonexistent/repo/root');
    expect(r.rotated).toBe(false);
  });
});
