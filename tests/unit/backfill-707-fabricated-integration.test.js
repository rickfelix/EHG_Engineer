/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-3): coverage for
 * scripts/one-off/backfill-707-fabricated-integration.mjs.
 *
 * Modeled on the sibling test tests/unit/backfill-integration-operationalization-v2.test.js
 * (SD-LEARN-FIX-ADDRESS-PAT-LES-012), adapted to this script's fabrication predicate
 * (integration_operationalization->consumers->0->>name = 'LEO Protocol Engine') instead of
 * an IS NULL predicate, and to its simpler write path (no metadata merge -- a plain
 * updated_by scalar column set alongside the replaced integration_operationalization value).
 *
 * EXEC-phase TESTING review finding: an earlier version of this fake client re-derived its
 * predicate match from the PRODUCTION module's own FABRICATION_PREDICATE_PATH/
 * FABRICATION_MARKER_VALUE constants, so a mutation to either constant moved the fake and the
 * code under test in lockstep -- 3 of 6 mutants survived (the exact class of drift the
 * sibling SD's parity suite header already warns about). Fixed by hardcoding the expected
 * path/marker as LITERALS independent of any import, so the fake genuinely simulates
 * PostgREST's WHERE-clause filtering: a mutated constant now produces a real behavioral
 * divergence (the guard silently fails to match, exactly as a live query would).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  enumerateFabricatedRows,
  writeCorrectedRow,
  FABRICATION_PREDICATE_PATH,
  FABRICATION_MARKER_VALUE,
} from '../../scripts/one-off/backfill-707-fabricated-integration.mjs';
import { buildDefaultIntegrationOperationalization } from '../../scripts/prd/prd-creator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Hardcoded literals matching the LIVE database predicate -- deliberately NOT imported from
// the production module, so a mutation to that module's own constants is independently
// detectable rather than re-derived.
const REAL_FABRICATION_PREDICATE_PATH = 'integration_operationalization->consumers->0->>name';
const REAL_FABRICATION_MARKER_VALUE = 'LEO Protocol Engine';

function rowMatchesRealFabricationShape(row) {
  return row.integration_operationalization?.consumers?.[0]?.name === REAL_FABRICATION_MARKER_VALUE;
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
      let selectEqCol = null;
      let selectEqVal = null;
      let gtId = null;
      const selectBuilder = {
        eq: (col, val) => {
          selectEqCol = col;
          selectEqVal = val;
          return selectBuilder;
        },
        order: () => selectBuilder,
        gt: (_col, id) => {
          gtId = id;
          return selectBuilder;
        },
        limit: async (n) => {
          // Simulate real PostgREST filtering: the SELECT only returns rows when the exact
          // path AND exact marker value were used to filter -- a mutated predicate constant
          // produces a genuinely different (non-matching) filter, not a re-derivation of the
          // same one.
          const predicateHolds = selectEqCol === REAL_FABRICATION_PREDICATE_PATH && selectEqVal === REAL_FABRICATION_MARKER_VALUE;
          let matched = predicateHolds ? rows.filter((r) => rowMatchesRealFabricationShape(r)) : [];
          if (gtId !== null) matched = matched.filter((r) => r.id > gtId);
          matched.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const page = matched.slice(0, n).map((r) => ({ id: r.id }));
          if (onRead) onRead(page, rows);
          return { data: page, error: null };
        },
        maybeSingle: async () => {
          const row = rows.find((r) => r.id === selectEqVal);
          if (selectEqCol === 'id' && row) {
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
                // Simulate the real WHERE clause: the exact path AND exact marker value must
                // both be present as recorded conditions, AND the row's current content must
                // genuinely match -- a mutated predicate constant (wrong path or wrong marker
                // value passed to .eq()) is a real behavioral divergence here, not a re-import.
                if (conditions[REAL_FABRICATION_PREDICATE_PATH] !== REAL_FABRICATION_MARKER_VALUE) {
                  return { data: null, error: null };
                }
                if (!rowMatchesRealFabricationShape(row)) {
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
      integration_operationalization: { consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] },
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
      integration_operationalization: { consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] },
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
      integration_operationalization: { consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] },
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
      integration_operationalization: { consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] },
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
    expect(rows[0].integration_operationalization).toEqual({ consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] });
    expect(rows[0].updated_by).toBeNull();
  });

  it('running writeCorrectedRow a second time against an already-corrected row is a no-op (idempotency)', async () => {
    const rows = [{
      id: 'prd-4',
      integration_operationalization: { consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] },
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

  it('FR-1 AC2: the placeholder written is exactly buildDefaultIntegrationOperationalization()\'s real output, imported not reimplemented', async () => {
    const realPlaceholder = buildDefaultIntegrationOperationalization();
    const rows = [{
      id: 'prd-5',
      integration_operationalization: { consumers: [{ name: REAL_FABRICATION_MARKER_VALUE }] },
      updated_at: '2026-01-01T00:00:00.000000',
      updated_by: null,
    }];
    const sb = makeFakeSupabase(rows);

    const result = await writeCorrectedRow(sb, 'prd-5', realPlaceholder);

    expect(result.written).toBe(true);
    // Written value is byte-identical to the REAL builder's output, not a hand-rolled
    // literal that could silently drift from it.
    expect(rows[0].integration_operationalization).toEqual(realPlaceholder);
    expect(Object.keys(rows[0].integration_operationalization).sort()).toEqual(
      ['consumers', 'data_contracts', 'dependencies', 'observability_rollout', 'runtime_config']
    );
    expect(Object.values(rows[0].integration_operationalization).every((v) => v === null)).toBe(true);
  });
});

describe('SD-LEO-FIX-REPLACE-707-FABRICATED-001: fabrication predicate constants match the live schema', () => {
  it('FABRICATION_PREDICATE_PATH matches the real jsonb path used to identify fabricated rows', () => {
    expect(FABRICATION_PREDICATE_PATH).toBe('integration_operationalization->consumers->0->>name');
  });

  it('FABRICATION_MARKER_VALUE matches the real fabricated marker value', () => {
    expect(FABRICATION_MARKER_VALUE).toBe('LEO Protocol Engine');
  });
});

describe('SD-LEO-FIX-REPLACE-707-FABRICATED-001 (FR-4): archived script refuses to run', () => {
  const archivedScriptPath = join(__dirname, '..', '..', 'scripts', 'archive', 'one-time', 'backfill-prd-integration.js');

  it('exits non-zero and prints a refusal message, without reaching any DB connection code', () => {
    let threw = null;
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [archivedScriptPath], { encoding: 'utf8', timeout: 10000 });
    } catch (err) {
      threw = err;
      stdout = (err.stdout || '') + (err.stderr || '');
    }
    expect(threw).not.toBeNull();
    expect(threw.status).toBe(1);
    expect(stdout).toMatch(/ARCHIVED SCRIPT -- REFUSING TO RUN/);
  });

  it('exits non-zero even when given --dry-run (the guard fires unconditionally, before argv is inspected)', () => {
    let threw = null;
    try {
      execFileSync(process.execPath, [archivedScriptPath, '--dry-run'], { encoding: 'utf8', timeout: 10000 });
    } catch (err) {
      threw = err;
    }
    expect(threw).not.toBeNull();
    expect(threw.status).toBe(1);
  });
});
