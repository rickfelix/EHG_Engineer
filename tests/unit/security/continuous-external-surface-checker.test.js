/**
 * SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001 -- TS-2, TS-4, TS-5.
 *
 * Mocked-dependency unit tests for lib/security/continuous-external-surface-checker.mjs,
 * mirroring the injectable-`connect` pattern already used by
 * lib/security/pg-net-exposure.js and its own test suite (tests/unit/security/pg-net-exposure.test.js).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyApproval,
  runContinuousExternalSurfaceCheck,
  ALLOWLIST_TABLE,
  CANARY_TABLE,
} from '../../../lib/security/continuous-external-surface-checker.mjs';

function pgClient({ tables, allowlistRows }) {
  return {
    query: async (sql) => {
      if (/FROM pg_class/.test(sql)) return { rows: tables };
      if (sql.includes(ALLOWLIST_TABLE)) return { rows: allowlistRows };
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };
}

// Anon client stub matching supabase-js's `.from(table).select('*').limit(1)` chain shape.
function anonClient(responsesByTable) {
  return {
    from: (table) => ({
      select: () => ({
        limit: async () => responsesByTable[table] ?? { data: [], error: null },
      }),
    }),
  };
}

const CLEAN_CANARY = { data: [{ id: 'x' }], error: null };
const DENIED = { data: null, error: { code: '42501', message: 'permission denied for table x' } };
const EMPTY = { data: [], error: null };
const NETWORK_ERR = { data: null, error: { message: 'connect ETIMEDOUT' } };

describe('classifyApproval (FR-7 semantic-shape classifier)', () => {
  it('classifies an unconventionally-named approval field as approved, by shape not name', () => {
    const record = {
      table_name: 'foo',
      chairman_drop_approval: '2026-09-01T00:00:00Z', // unrelated extra field, must be ignored
      approved_by: 'chairman',
      approved_at: '2026-09-01T00:00:00Z',
    };
    const verdict = classifyApproval(record);
    expect(verdict.approved).toBe(true);
    expect(verdict.reason).toBe('approved_at_present');
  });

  it('classifies a hold/fence-shaped object with no approved_at as NOT approved, regardless of hold/fence-named keys', () => {
    const record = { table_name: 'bar', hold: true, fence: 'active', locked_reason: 'awaiting review' };
    const verdict = classifyApproval(record);
    expect(verdict.approved).toBe(false);
    expect(verdict.reason).toBe('no_approved_at');
  });

  it('rejects a non-object record', () => {
    expect(classifyApproval(null).approved).toBe(false);
    expect(classifyApproval('approved').approved).toBe(false);
  });

  it('rejects an unparseable approved_at', () => {
    expect(classifyApproval({ approved_at: 'not-a-date' }).approved).toBe(false);
  });
});

describe('runContinuousExternalSurfaceCheck (TS-2: 3-verdict canary distinctness)', () => {
  it('returns ERROR when the anon canary read fails (bad key / denied)', async () => {
    const connect = async () => pgClient({ tables: [], allowlistRows: [] });
    const anon = anonClient({ [CANARY_TABLE]: DENIED });
    const result = await runContinuousExternalSurfaceCheck({ connect, anonClient: anon });
    expect(result.verdict).toBe('ERROR');
    expect(result.reason).toMatch(/positive canary/);
  });

  it('returns ERROR when the pg connection itself is dead', async () => {
    const connect = async () => { throw new Error('connection refused'); };
    const anon = anonClient({ [CANARY_TABLE]: CLEAN_CANARY });
    const result = await runContinuousExternalSurfaceCheck({ connect, anonClient: anon });
    expect(result.verdict).toBe('ERROR');
    expect(result.reason).toMatch(/catalog connection unavailable/);
  });

  it('returns PASS/FINDINGS (never ERROR) on a genuine clean run with a working canary', async () => {
    const connect = async () => pgClient({ tables: [], allowlistRows: [] });
    const anon = anonClient({ [CANARY_TABLE]: CLEAN_CANARY });
    const result = await runContinuousExternalSurfaceCheck({ connect, anonClient: anon });
    expect(result.verdict).toBe('PASS');
  });

  it('produces 3 distinct verdict shapes across the 3 scenarios -- never all reading as "nothing exposed"', async () => {
    const badKey = await runContinuousExternalSurfaceCheck({
      connect: async () => pgClient({ tables: [], allowlistRows: [] }),
      anonClient: anonClient({ [CANARY_TABLE]: DENIED }),
    });
    const deadConn = await runContinuousExternalSurfaceCheck({
      connect: async () => { throw new Error('dead'); },
      anonClient: anonClient({ [CANARY_TABLE]: CLEAN_CANARY }),
    });
    const clean = await runContinuousExternalSurfaceCheck({
      connect: async () => pgClient({ tables: [], allowlistRows: [] }),
      anonClient: anonClient({ [CANARY_TABLE]: CLEAN_CANARY }),
    });
    const verdicts = [badKey.verdict, deadConn.verdict, clean.verdict];
    expect(verdicts).toEqual(['ERROR', 'ERROR', 'PASS']);
    // Both ERROR verdicts carry distinguishable reasons -- not a collapsed generic message.
    expect(badKey.reason).not.toBe(deadConn.reason);
  });
});

describe('runContinuousExternalSurfaceCheck (TS-4: coverage-report accuracy)', () => {
  it('reports exact enumerated/checked/allowlisted counts and names an unreachable table with a reason', async () => {
    const tables = [
      { name: 'allowed_1', rls_enabled: true, anon_select_grant: true, has_venture_id: false },
      { name: 'allowed_2', rls_enabled: true, anon_select_grant: true, has_venture_id: false },
      { name: 'flaky_table', rls_enabled: true, anon_select_grant: true, has_venture_id: false },
      { name: 'exposed_table', rls_enabled: false, anon_select_grant: true, has_venture_id: true },
    ];
    const allowlistRows = [
      { table_name: 'allowed_1', approved_at: '2026-09-01T00:00:00Z' },
      { table_name: 'allowed_2', approved_at: '2026-09-01T00:00:00Z' },
    ];
    const connect = async () => pgClient({ tables, allowlistRows });
    const anon = anonClient({
      [CANARY_TABLE]: CLEAN_CANARY,
      flaky_table: NETWORK_ERR,
      exposed_table: { data: [{ id: 1 }], error: null },
    });

    const result = await runContinuousExternalSurfaceCheck({ connect, anonClient: anon });

    expect(result.verdict).toBe('FINDINGS');
    expect(result.coverage.enumerated).toBe(4);
    expect(result.coverage.checked).toBe(2); // flaky_table + exposed_table (allowlisted skipped)
    expect(result.coverage.allowlisted).toBe(2);
    expect(result.coverage.unreachable).toHaveLength(1);
    expect(result.coverage.unreachable[0].table).toBe('flaky_table');
    expect(result.coverage.unreachable[0].reason).toMatch(/ETIMEDOUT/);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].table).toBe('exposed_table');
  });

  it('treats an empty live read on an RLS-disabled, anon-granted table as a finding (catalog cross-check)', async () => {
    const tables = [{ name: 'quietly_open', rls_enabled: false, anon_select_grant: true, has_venture_id: false }];
    const connect = async () => pgClient({ tables, allowlistRows: [] });
    const anon = anonClient({ [CANARY_TABLE]: CLEAN_CANARY, quietly_open: EMPTY });
    const result = await runContinuousExternalSurfaceCheck({ connect, anonClient: anon });
    expect(result.verdict).toBe('FINDINGS');
    expect(result.findings[0].evidence).toBe('catalog_confirmed_grant_and_rls_disabled_live_read_empty');
  });

  it('does NOT flag an empty live read on an RLS-enabled table as a finding', async () => {
    const tables = [{ name: 'rls_protected_empty', rls_enabled: true, anon_select_grant: true, has_venture_id: false }];
    const connect = async () => pgClient({ tables, allowlistRows: [] });
    const anon = anonClient({ [CANARY_TABLE]: CLEAN_CANARY, rls_protected_empty: EMPTY });
    const result = await runContinuousExternalSurfaceCheck({ connect, anonClient: anon });
    expect(result.verdict).toBe('PASS');
    expect(result.findings).toHaveLength(0);
  });
});
