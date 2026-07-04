/**
 * SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001 -- unit coverage for coverage-matrix.js's pure
 * decision logic (checker-map matching, exclusion filtering, enumeration + upsert/stale logic),
 * using injected-stub Supabase clients so the pure logic is exercised without a live DB.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isExcludedTable,
  matchCheckerIds,
  enumerateInstitutionalMemory,
  periodicProcessPlaceholderRow,
  enumerateExternalChannels,
  enumerateApplications,
  enumerateDbTables,
  enumerateMessageLanes,
  regenerateCoverageMatrix,
} from '../../../lib/governance/coverage-matrix.js';

describe('isExcludedTable', () => {
  it('excludes a table listed by exact name', () => {
    expect(isExcludedTable('schema_migrations', { db_table_name_exclusions: ['schema_migrations'] })).toBe(true);
  });

  it('excludes a table matching a prefix', () => {
    expect(isExcludedTable('staging_orders', { db_table_name_prefix_exclusions: ['staging_'] })).toBe(true);
  });

  it('does not exclude an unrelated table', () => {
    expect(isExcludedTable('strategic_directives_v2', { db_table_name_exclusions: ['schema_migrations'], db_table_name_prefix_exclusions: ['staging_'] })).toBe(false);
  });
});

describe('matchCheckerIds', () => {
  const entries = [
    { surface_class: 'db_table', pattern: 'merge_witness_telemetry', checker_ids: ['lib/ship/merge-witness-ladder.mjs'] },
    { surface_class: 'work_item_type', pattern: 'gauge_registry', checker_ids: ['scripts/gauge-runner.mjs'] },
  ];

  it('matches a known surface_key by substring within the correct surface_class', () => {
    expect(matchCheckerIds('db_table', 'merge_witness_telemetry', entries)).toEqual(['lib/ship/merge-witness-ladder.mjs']);
  });

  it('does not match across surface classes', () => {
    expect(matchCheckerIds('message_lane', 'merge_witness_telemetry', entries)).toEqual([]);
  });

  it('returns empty (checker=NONE) for an unmapped surface -- the intended default, not an error', () => {
    expect(matchCheckerIds('db_table', 'some_brand_new_table', entries)).toEqual([]);
  });

  it('dedupes checker_ids across multiple matching entries', () => {
    const dupeEntries = [
      { surface_class: 'db_table', pattern: 'foo', checker_ids: ['a.mjs'] },
      { surface_class: 'db_table', pattern: 'foo_bar', checker_ids: ['a.mjs', 'b.mjs'] },
    ];
    expect(matchCheckerIds('db_table', 'foo_bar_table', dupeEntries).sort()).toEqual(['a.mjs', 'b.mjs']);
  });
});

describe('enumerateInstitutionalMemory', () => {
  it('enumerates repo-local memory/*.md files, ignoring non-md files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coverage-matrix-memory-'));
    writeFileSync(join(dir, 'feedback_example.md'), '# example');
    writeFileSync(join(dir, 'notes.txt'), 'not markdown');
    const result = enumerateInstitutionalMemory(dir);
    rmSync(dir, { recursive: true, force: true });

    expect(result).toEqual([{ surface_key: 'feedback_example.md', is_active: true }]);
  });

  it('returns an empty array (not a throw) when the memory directory does not exist', () => {
    expect(enumerateInstitutionalMemory('/nonexistent/path/xyz')).toEqual([]);
  });
});

describe('periodicProcessPlaceholderRow', () => {
  it('is status=pending_dependency and references the dependency SD by key', () => {
    const row = periodicProcessPlaceholderRow();
    expect(row.status).toBe('pending_dependency');
    expect(row.is_active).toBe(false);
    expect(row.metadata.depends_on_sd_key).toBe('SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001');
  });
});

describe('enumerateExternalChannels', () => {
  it('returns the 4 known static channels, all active', () => {
    const rows = enumerateExternalChannels();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.is_active)).toBe(true);
  });
});

describe('enumerateApplications', () => {
  it('excludes soft-deleted applications via the deleted_at IS NULL filter', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          is: () => Promise.resolve({ data: [{ normalized_name: 'ehg-engineer' }, { normalized_name: 'ehg' }], error: null }),
        }),
      }),
    };
    const rows = await enumerateApplications(supabase);
    expect(rows).toEqual([
      { surface_key: 'ehg-engineer', is_active: true },
      { surface_key: 'ehg', is_active: true },
    ]);
  });

  it('throws with a descriptive error on query failure rather than silently returning []', async () => {
    const supabase = { from: () => ({ select: () => ({ is: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) };
    await expect(enumerateApplications(supabase)).rejects.toThrow(/boom/);
  });
});

describe('enumerateDbTables (pg client)', () => {
  it('excludes configured tables and reports is_active from live_rows', async () => {
    const pgClient = {
      query: () => Promise.resolve({
        rows: [
          { table_name: 'strategic_directives_v2', live_rows: '4890' },
          { table_name: 'staging_temp', live_rows: '0' },
        ],
      }),
    };
    const rows = await enumerateDbTables(pgClient, { db_table_name_prefix_exclusions: ['staging_'] });
    expect(rows).toEqual([{ surface_key: 'strategic_directives_v2', is_active: true }]);
  });
});

describe('enumerateMessageLanes (pg client enum + supabase signal_type window)', () => {
  it('combines structural enum labels (always active) with data-driven signal_type lanes', async () => {
    const pgClient = { query: () => Promise.resolve({ rows: [{ enumlabel: 'STOP_REQUESTED' }, { enumlabel: 'SAVE_WARNING' }] }) };
    const supabase = {
      from: () => ({
        select: () => ({
          not: () => ({
            gte: () => Promise.resolve({
              data: [{ payload: { signal_type: 'stuck' }, created_at: new Date().toISOString() }],
              error: null,
            }),
          }),
        }),
      }),
    };
    const rows = await enumerateMessageLanes(pgClient, supabase);
    expect(rows).toEqual(expect.arrayContaining([
      { surface_key: 'STOP_REQUESTED', is_active: true },
      { surface_key: 'SAVE_WARNING', is_active: true },
      { surface_key: 'stuck', is_active: true },
    ]));
  });
});

describe('regenerateCoverageMatrix: stale-marking on vanished surfaces', () => {
  it('marks a previously-seen surface_key as stale (never deletes) when it no longer appears in the current enumeration', async () => {
    const upserts = [];
    const staleUpdates = [];

    const pgClient = {
      query: () => Promise.resolve({ rows: [] }), // db_table query + enum-label query both empty
    };

    const supabase = {
      from: (table) => {
        if (table === 'applications') return { select: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) };
        if (table === 'session_coordination') {
          return { select: () => ({ not: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }) }) };
        }
        if (table === 'coverage_matrix') {
          return {
            select: () => ({
              eq: (col, val) => {
                if (col === 'surface_class' && val === 'db_table') {
                  return Promise.resolve({ data: [{ surface_key: 'vanished_table' }], error: null });
                }
                return Promise.resolve({ data: [], error: null });
              },
            }),
            upsert: (rows) => { upserts.push(...rows); return Promise.resolve({ error: null }); },
            update: (patch) => ({
              eq: () => ({
                in: (col, keys) => { staleUpdates.push({ patch, keys }); return Promise.resolve({ error: null }); },
              }),
            }),
          };
        }
        // work_item_type tables: count=0, no rows
        return { select: () => Promise.resolve({ count: 0, error: null }) };
      },
    };

    const summary = await regenerateCoverageMatrix(supabase, pgClient, { exclusions: {}, checkerMapEntries: [], gaugeRegistry: [], memoryDirPath: '/nonexistent-test-path-for-hermetic-unit-test' });

    expect(staleUpdates).toHaveLength(1);
    expect(staleUpdates[0].patch.status).toBe('stale');
    expect(staleUpdates[0].keys).toEqual(['vanished_table']);
    // The vanished table is never in the upsert list -- it is marked stale via update, not re-inserted
    expect(upserts.find((u) => u.surface_key === 'vanished_table')).toBeUndefined();
    expect(summary.stale).toBe(1);
  });
});
