/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-3): coverage for
 * scripts/one-off/backfill-707-fabricated-integration.mjs.
 *
 * Modeled on the sibling test tests/unit/backfill-integration-operationalization-v2.test.js
 * (SD-LEARN-FIX-ADDRESS-PAT-LES-012), adapted to this script's fabrication predicate
 * (integration_operationalization->consumers->0->>name = 'LEO Protocol Engine') instead of
 * an IS NULL predicate, and to its simpler write path (no metadata merge -- a plain
 * updated_by scalar column set alongside the replaced integration_operationalization value).
 */
import { describe, it, expect } from 'vitest';
import {
  enumerateFabricatedRows,
  writeCorrectedRow,
  FABRICATION_PREDICATE_PATH,
  FABRICATION_MARKER_VALUE,
} from '../../scripts/one-off/backfill-707-fabricated-integration.mjs';

function matchesFabricationPredicate(row) {
  return row.integration_operationalization?.consumers?.[0]?.name === FABRICATION_MARKER_VALUE;
}

/**
 * Fake Supabase client backing a `product_requirements_v2`-shaped table of rows
 * {id, integration_operationalization, updated_at, updated_by}. Supports the exact query
 * chains enumerateFabricatedRows and writeCorrectedRow use.
 */
function makeFakeSupabase(rows, { onRead } = {}) {
  return {
    rows,
    from(_table) {
      let eqCol = null;
      let eqVal = null;
      let gtId = null;
      const selectBuilder = {
        eq: (col, val) => {
          eqCol = col;
          eqVal = val;
          return selectBuilder;
        },
        order: () => selectBuilder,
        gt: (_col, id) => {
          gtId = id;
          return selectBuilder;
        },
        limit: async (n) => {
          let matched = rows.filter((r) => matchesFabricationPredicate(r));
          if (gtId !== null) matched = matched.filter((r) => r.id > gtId);
          matched.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const page = matched.slice(0, n).map((r) => ({ id: r.id }));
          if (onRead) onRead(page, rows);
          return { data: page, error: null };
        },
        maybeSingle: async () => {
          const row = rows.find((r) => r.id === eqVal);
          if (eqCol === 'id' && row) {
            return { data: { updated_at: row.updated_at }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return {
        select: () => selectBuilder,
        update: (patch) => {
          const conditions = {};
          const builder = {
            eq: (col, val) => {
              conditions[col] = val;
              return builder;
            },
            select: () => ({
              maybeSingle: async () => {
                const row = rows.find((r) => r.id === conditions.id);
                if (!row) return { data: null, error: null };
                if (
                  conditions.updated_at !== undefined &&
                  conditions.updated_at !== row.updated_at
                ) {
                  // CAS mismatch: matches real PostgREST behavior -- 0 rows, no write.
                  return { data: null, error: null };
                }
                if (
                  conditions[FABRICATION_PREDICATE_PATH] !== undefined &&
                  !matchesFabricationPredicate(row)
                ) {
                  // Predicate no longer matches (already corrected) -- 0 rows, no write.
                  return { data: null, error: null };
                }
                Object.assign(row, patch);
                return { data: { id: row.id }, error: null };
              },
            }),
          };
          return builder;
        },
      };
    },
  };
}

describe('SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-3): keyset enumeration survives a shrinking fabrication predicate', () => {
  it('visits every fabricated row exactly once across multiple pages, even when rows are corrected (leave the predicate) between pages', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `r${String(i + 1).padStart(2, '0')}`,
      integration_operationalization: { consumers: [{ name: FABRICATION_MARKER_VALUE }] },
      updated_at: '2026-01-01T00:00:00.000000',
      updated_by: null,
    }));

    const visited = [];
    const sb = makeFakeSupabase(rows, {
      onRead: (page) => {
        if (page.length > 0) {
          const target = rows.find((r) => r.id === page[0].id);
          if (target) target.integration_operationalization = { consumers: [{ name: 'corrected-already' }] };
        }
      },
    });

    for await (const id of enumerateFabricatedRows(sb, 5)) {
      visited.push(id);
    }

    expect(visited.sort()).toEqual(rows.map((r) => r.id).sort());
    expect(visited.length).toBe(25);
    expect(new Set(visited).size).toBe(25);
  });

  it('returns an empty enumeration when no rows match the fabrication predicate', async () => {
    const rows = [{ id: 'r01', integration_operationalization: { consumers: [{ name: 'genuine' }] } }];
    const sb = makeFakeSupabase(rows);
    const visited = [];
    for await (const id of enumerateFabricatedRows(sb, 5)) visited.push(id);
    expect(visited).toEqual([]);
  });

  it('a batch exactly equal to batchSize still terminates', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i + 1}`,
      integration_operationalization: { consumers: [{ name: FABRICATION_MARKER_VALUE }] },
    }));
    const sb = makeFakeSupabase(rows);
    const visited = [];
    for await (const id of enumerateFabricatedRows(sb, 5)) visited.push(id);
    expect(visited.length).toBe(5);
  });
});

describe('SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-1, FR-3): writeCorrectedRow', () => {
  const placeholder = { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null };

  it('writes the placeholder and sets updated_by', async () => {
    const rows = [{
      id: 'prd-1',
      integration_operationalization: { consumers: [{ name: FABRICATION_MARKER_VALUE }] },
      updated_at: '2026-01-01T00:00:00.000000',
      updated_by: null,
    }];
    const sb = makeFakeSupabase(rows);

    const result = await writeCorrectedRow(sb, 'prd-1', placeholder);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    expect(rows[0].integration_operationalization).toEqual(placeholder);
    expect(rows[0].updated_by).toBe('backfill-707-fabricated-integration.mjs');
  });

  it('does not write when the row no longer matches the fabrication predicate (already corrected)', async () => {
    const rows = [{
      id: 'prd-2',
      integration_operationalization: { consumers: [{ name: 'genuine-content' }] },
      updated_at: '2026-01-01T00:00:00.000000',
      updated_by: null,
    }];
    const sb = makeFakeSupabase(rows);

    const result = await writeCorrectedRow(sb, 'prd-2', placeholder);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(false);
    // Untouched -- the guard prevented the write entirely.
    expect(rows[0].integration_operationalization).toEqual({ consumers: [{ name: 'genuine-content' }] });
    expect(rows[0].updated_by).toBeNull();
  });

  it('rejects the write when the row changed (updated_at CAS mismatch) between read and write', async () => {
    const rows = [{
      id: 'prd-3',
      integration_operationalization: { consumers: [{ name: FABRICATION_MARKER_VALUE }] },
      updated_at: '2026-01-01T00:00:00.000000',
      updated_by: null,
    }];
    const sb = makeFakeSupabase(rows);
    // Simulate a concurrent writer touching the row between read and write.
    const realFrom = sb.from.bind(sb);
    sb.from = (table) => {
      const built = realFrom(table);
      const origSelect = built.select;
      built.select = (...args) => {
        const sel = origSelect(...args);
        const origMaybeSingle = sel.maybeSingle;
        sel.maybeSingle = async () => {
          const res = await origMaybeSingle();
          // After the read, simulate a concurrent write bumping updated_at.
          rows[0].updated_at = 'CHANGED-' + rows[0].updated_at;
          return res;
        };
        return sel;
      };
      return built;
    };

    const result = await writeCorrectedRow(sb, 'prd-3', placeholder);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(false);
    // Write never landed -- fabricated content and updated_by are untouched.
    expect(rows[0].integration_operationalization).toEqual({ consumers: [{ name: FABRICATION_MARKER_VALUE }] });
    expect(rows[0].updated_by).toBeNull();
  });

  it('running writeCorrectedRow a second time against an already-corrected row is a no-op (idempotency)', async () => {
    const rows = [{
      id: 'prd-4',
      integration_operationalization: { consumers: [{ name: FABRICATION_MARKER_VALUE }] },
      updated_at: '2026-01-01T00:00:00.000000',
      updated_by: null,
    }];
    const sb = makeFakeSupabase(rows);

    const first = await writeCorrectedRow(sb, 'prd-4', placeholder);
    expect(first.written).toBe(true);

    const second = await writeCorrectedRow(sb, 'prd-4', placeholder);
    expect(second.ok).toBe(true);
    expect(second.written).toBe(false);
    expect(rows[0].integration_operationalization).toEqual(placeholder);
  });
});
