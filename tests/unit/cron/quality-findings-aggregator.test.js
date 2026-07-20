import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  parseArgs,
  readEnvLookbackDays,
  readEnvIntervalSec,
  readEnvMinVentureCount,
  buildLookbackCutoffIso,
  writeAggregatorAuditLog,
  runOneBatch,
  runOnce,
} from '../../../scripts/cron/quality-findings-aggregator.mjs';

const ENV_KEYS = [
  'LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS',
  'LEO_QUALITY_AGGREGATOR_INTERVAL_SEC',
  'LEO_QUALITY_AGGREGATOR_MIN_VENTURE_COUNT',
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('parseArgs', () => {
  it('parses --daemon, --dry-run, --help', () => {
    expect(parseArgs(['node', 'x'])).toEqual({ daemon: false, dryRun: false, help: false });
    expect(parseArgs(['node', 'x', '--daemon'])).toMatchObject({ daemon: true });
    expect(parseArgs(['node', 'x', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(parseArgs(['node', 'x', '--help'])).toMatchObject({ help: true });
    expect(parseArgs(['node', 'x', '-h'])).toMatchObject({ help: true });
  });
});

describe('readEnvLookbackDays', () => {
  it('defaults to 7 when unset', () => {
    expect(readEnvLookbackDays()).toBe(7);
  });

  it('accepts a positive integer', () => {
    process.env.LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS = '14';
    expect(readEnvLookbackDays()).toBe(14);
  });

  it('rejects 0', () => {
    process.env.LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS = '0';
    expect(() => readEnvLookbackDays()).toThrow(/below minimum 1/);
  });

  it('rejects negative', () => {
    process.env.LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS = '-3';
    expect(() => readEnvLookbackDays()).toThrow(/below minimum 1/);
  });

  it('rejects non-integer', () => {
    process.env.LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS = 'abc';
    expect(() => readEnvLookbackDays()).toThrow(/not an integer/);
  });

  it('rejects float-like input', () => {
    process.env.LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS = '7.5';
    expect(() => readEnvLookbackDays()).toThrow(/not an integer/);
  });
});

describe('readEnvIntervalSec', () => {
  it('defaults to 86400', () => {
    expect(readEnvIntervalSec()).toBe(86400);
  });

  it('rejects below minimum 60', () => {
    process.env.LEO_QUALITY_AGGREGATOR_INTERVAL_SEC = '30';
    expect(() => readEnvIntervalSec()).toThrow(/below minimum 60s/);
  });

  it('rejects non-integer', () => {
    process.env.LEO_QUALITY_AGGREGATOR_INTERVAL_SEC = 'xyz';
    expect(() => readEnvIntervalSec()).toThrow(/not an integer/);
  });
});

describe('readEnvMinVentureCount', () => {
  it('defaults to 3', () => {
    expect(readEnvMinVentureCount()).toBe(3);
  });

  it('rejects 0', () => {
    process.env.LEO_QUALITY_AGGREGATOR_MIN_VENTURE_COUNT = '0';
    expect(() => readEnvMinVentureCount()).toThrow(/positive integer/);
  });
});

describe('buildLookbackCutoffIso', () => {
  it('subtracts the lookback window in UTC', () => {
    const nowMs = Date.UTC(2026, 4, 2, 12, 0, 0);
    const isoFor7Days = buildLookbackCutoffIso(7, nowMs);
    expect(isoFor7Days).toBe(new Date(Date.UTC(2026, 3, 25, 12, 0, 0)).toISOString());
    const isoFor1Day = buildLookbackCutoffIso(1, nowMs);
    expect(isoFor1Day).toBe(new Date(Date.UTC(2026, 4, 1, 12, 0, 0)).toISOString());
  });
});

describe('writeAggregatorAuditLog', () => {
  it('writes a row with non-null entity_id (defends FR-C audit_log NOT NULL incident)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) };
    await writeAggregatorAuditLog(supabase, 'quality_aggregator_run', { run_id: 'aggregate-1' }, { severity: 'info' });
    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.event_type).toBe('quality_aggregator_run');
    expect(row.entity_type).toBe('quality_aggregator_run');
    expect(row.entity_id).toBe('aggregate-1');
    expect(row.severity).toBe('info');
    expect(row.created_by).toBe('quality-aggregator');
    expect(row.metadata.generator).toBe('quality-aggregator');
  });

  it('falls back to lock_name when entityId + run_id absent', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) };
    await writeAggregatorAuditLog(supabase, 'quality_aggregator_lock_held', { lock_name: 'quality_aggregator' });
    const row = insert.mock.calls[0][0];
    expect(row.entity_id).toBeTruthy();
  });

  it('swallows insert errors (best-effort)', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('boom'));
    const supabase = { from: vi.fn(() => ({ insert })) };
    await expect(writeAggregatorAuditLog(supabase, 'quality_aggregator_run', { run_id: 'x' })).resolves.toBeUndefined();
  });
});

describe('runOneBatch', () => {
  it('returns dry-run summary without invoking supabase', async () => {
    const supabase = { from: vi.fn() };
    const out = await runOneBatch({
      supabase,
      lookbackDays: 7,
      minVentureCount: 3,
      dryRun: true,
      runId: 'aggregate-dry',
    });
    expect(out.dry_run).toBe(true);
    expect(out.findings_read).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reads findings filtered by lookback + status, calls aggregateFindings, returns counts', async () => {
    const findings = [
      { id: 'f1', venture_id: 'v1', finding_category: 'lint', severity: 'low', check_name: 'no-unused', created_at: new Date().toISOString() },
      { id: 'f2', venture_id: 'v2', finding_category: 'lint', severity: 'low', check_name: 'no-unused', created_at: new Date().toISOString() },
      { id: 'f3', venture_id: 'v3', finding_category: 'lint', severity: 'low', check_name: 'no-unused', created_at: new Date().toISOString() },
    ];
    const select = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const gte = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: production now paginates via
    // fetchAllPaginated, which appends .range() after the filter chain — extend the mock with
    // a chainable .order() and a .range() that resolves the page (short page ends the loop).
    const range = vi.fn().mockResolvedValue({ data: findings, error: null });
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_quality_findings') return { select, eq, gte, order, range };
        if (table === 'quality_finding_patterns') return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
        throw new Error('unexpected table ' + table);
      }),
    };

    const out = await runOneBatch({ supabase, lookbackDays: 7, minVentureCount: 3, dryRun: false, runId: 'aggregate-int' });
    expect(out.findings_read).toBe(3);
    expect(out.ventures_scanned).toBe(3);
    expect(out.lookback_days).toBe(7);
    expect(out.errors).toEqual([]);
    expect(out.lookback_cutoff_utc).toMatch(/T/);
    expect(eq).toHaveBeenCalledWith('status', 'open');
    expect(gte).toHaveBeenCalledWith('created_at', expect.any(String));
  });

  it('throws when supabase read fails', async () => {
    const select = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const gte = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const range = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls' } });
    const supabase = { from: vi.fn(() => ({ select, eq, gte, order, range })) };
    await expect(runOneBatch({ supabase, lookbackDays: 7, minVentureCount: 3, dryRun: false, runId: 'x' }))
      .rejects.toThrow(/venture_quality_findings read failed/);
  });
});

describe('runOnce', () => {
  function buildPgClient(acquired = true) {
    return {
      query: vi.fn(async (sql) => {
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired }] };
        if (sql.includes('pg_advisory_unlock')) return { rows: [{}] };
        return { rows: [{}] };
      }),
    };
  }
  function buildSupabase() {
    const insert = vi.fn().mockResolvedValue({ error: null });
    return { from: vi.fn(() => ({ insert })), __insert: insert };
  }

  it('lock-held path is graceful no-op (exit 0, lock_held audit row)', async () => {
    const pgClient = buildPgClient(false);
    const supabase = buildSupabase();
    const out = await runOnce({
      args: { dryRun: false },
      supabase,
      pgClient,
      lockKey: 12345,
      lookbackDays: 7,
      minVentureCount: 3,
    });
    expect(out.exitCode).toBe(0);
    expect(out.summary.lockHeld).toBe(true);
    const auditRow = supabase.__insert.mock.calls[0][0];
    expect(auditRow.event_type).toBe('quality_aggregator_lock_held');
    expect(auditRow.entity_id).toBeTruthy();
  });

  it('failure-path emits error audit row + exit 1 + releases lock', async () => {
    const pgClient = buildPgClient(true);
    const supabase = buildSupabase();
    // Make from('venture_quality_findings') throw via gte rejection
    let calls = 0;
    supabase.from = vi.fn((table) => {
      calls++;
      if (table === 'venture_quality_findings') {
        return {
          select: () => ({ eq: () => ({ gte: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }),
        };
      }
      return { insert: supabase.__insert };
    });

    const out = await runOnce({
      args: { dryRun: false },
      supabase,
      pgClient,
      lockKey: 12345,
      lookbackDays: 7,
      minVentureCount: 3,
    });
    expect(out.exitCode).toBe(1);
    expect(supabase.__insert).toHaveBeenCalledTimes(1);
    const auditRow = supabase.__insert.mock.calls[0][0];
    expect(auditRow.severity).toBe('error');
    expect(auditRow.metadata.error).toMatch(/boom/);
    // Lock was released
    const unlockCall = pgClient.query.mock.calls.find((c) => c[0].includes('pg_advisory_unlock'));
    expect(unlockCall).toBeDefined();
  });

  it('dry-run path acquires lock, emits success audit row, exits 0', async () => {
    const pgClient = buildPgClient(true);
    const supabase = buildSupabase();
    const out = await runOnce({
      args: { dryRun: true },
      supabase,
      pgClient,
      lockKey: 12345,
      lookbackDays: 5,
      minVentureCount: 3,
    });
    expect(out.exitCode).toBe(0);
    expect(out.summary.dry_run).toBe(true);
    const auditRow = supabase.__insert.mock.calls[0][0];
    expect(auditRow.event_type).toBe('quality_aggregator_run');
    expect(auditRow.severity).toBe('info');
    expect(auditRow.metadata.lookback_days).toBe(5);
    expect(auditRow.metadata.dry_run).toBe(true);
  });
});
