/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012 (TS-6, FR-5, TESTING finding F10): the backfill
 * enumerator must use keyset pagination, not offset/.range(). The archived fabricator
 * (scripts/archive/one-time/backfill-prd-integration.js) paginated via
 * .is(integration_operationalization, null).range(offset, offset+BATCH-1) while its own
 * writes shrank the matched set each batch -- so each subsequent offset page silently
 * skipped roughly half the remaining unprocessed rows. This is the actual, documented
 * reason only 707 of a much larger NULL population were ever fabricated.
 *
 * This test simulates exactly that shrinking-predicate scenario, FORCED across multiple
 * pages (batchSize is injectable specifically so this test can exercise the .gt(lastId)
 * code path, not just a single all-in-one-page read), and asserts the keyset enumerator
 * visits every row exactly once -- which an offset-based enumerator would NOT survive.
 */
import { describe, it, expect } from 'vitest';
import { enumerateNullRows, writeBackfillRow } from '../../scripts/one-off/backfill-integration-operationalization-v2.mjs';

/**
 * Fake Supabase client backing a `product_requirements_v2`-shaped table of rows
 * {id, integration_operationalization}. Supports the exact query chain the enumerator
 * uses: .select('id').is(...).order('id',{ascending:true})[.gt('id', lastId)].limit(N).
 * `onRead` fires after each page is computed, letting a test shrink the underlying NULL
 * set mid-enumeration to reproduce the pagination hazard.
 */
function makeKeysetFakeSupabase(rows, { onRead } = {}) {
  return {
    from(_table) {
      let gtId = null;
      const builder = {
        select: () => builder,
        is: () => builder,
        order: () => builder,
        gt: (_col, id) => {
          gtId = id;
          return builder;
        },
        limit: async (n) => {
          let matched = rows.filter((r) => r.integration_operationalization === null);
          if (gtId !== null) matched = matched.filter((r) => r.id > gtId);
          matched.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const page = matched.slice(0, n).map((r) => ({ id: r.id }));
          if (onRead) onRead(page, rows);
          return { data: page, error: null };
        },
      };
      return builder;
    },
  };
}

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012 (TS-6): backfill keyset pagination survives a shrinking predicate', () => {
  it('visits every row exactly once, across multiple pages, even when rows are written (leave the NULL set) between pages', async () => {
    // 25 rows, batchSize=5 forces 5+ pages. onRead "writes" (nulls out) the FIRST row of
    // each page immediately after it's read -- reproducing "the predicate shrinks while
    // paginating" concretely. An offset-based enumerator (.range(offset, offset+4)) would
    // now skip the row that shifted into the position the next offset page starts from; a
    // keyset enumerator (id > lastId) is unaffected because it never re-reads by position.
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `r${String(i + 1).padStart(2, '0')}`,
      integration_operationalization: null,
    }));

    const visited = [];
    const sb = makeKeysetFakeSupabase(rows, {
      onRead: (page) => {
        if (page.length > 0) {
          const target = rows.find((r) => r.id === page[0].id);
          if (target) target.integration_operationalization = { touched: true };
        }
      },
    });

    for await (const id of enumerateNullRows(sb, 5)) {
      visited.push(id);
    }

    expect(visited.sort()).toEqual(rows.map((r) => r.id).sort());
    expect(visited.length).toBe(25);
    expect(new Set(visited).size).toBe(25); // no duplicates
  });

  it('returns an empty enumeration when no rows are NULL', async () => {
    const rows = [{ id: 'r01', integration_operationalization: { has: 'content' } }];
    const sb = makeKeysetFakeSupabase(rows);
    const visited = [];
    for await (const id of enumerateNullRows(sb, 5)) visited.push(id);
    expect(visited).toEqual([]);
  });

  it('a batch exactly equal to batchSize still terminates (does not loop forever probing for a non-existent next page)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i + 1}`, integration_operationalization: null }));
    const sb = makeKeysetFakeSupabase(rows);
    const visited = [];
    for await (const id of enumerateNullRows(sb, 5)) visited.push(id);
    expect(visited.length).toBe(5);
  });
});

/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012 (metadata-preservation regression, per SECURITY
 * evidence row 9d21ac12 and TESTING evidence row 96d51bde F5): the FIRST --execute run of
 * this script blind-replaced product_requirements_v2.metadata on 1,570 rows instead of
 * merging, destroying 7,743 keys across 1,382 rows. This is the assertion that would have
 * caught it before it shipped: pre-existing metadata keys MUST be a subset of post-write
 * keys. Recovered via scripts/one-off/restore-integration-backfill-metadata.mjs.
 */
function makeWriteFakeSupabase(initialRow, { simulateConcurrentWriteAfterRead = false } = {}) {
  const state = { row: { updated_at: '2026-01-01T00:00:00.000000', ...initialRow } };
  return {
    state,
    from(_table) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              const readSnapshot = { metadata: state.row.metadata, updated_at: state.row.updated_at };
              if (simulateConcurrentWriteAfterRead) {
                // Simulates another writer touching this row in the gap between this
                // read and the eventual write -- exactly the race the updated_at CAS
                // guard exists to catch. The real table's BEFORE-UPDATE trigger touches
                // updated_at on every write, so any concurrent write moves it.
                state.row = {
                  ...state.row,
                  metadata: { ...(state.row.metadata || {}), concurrent_writer_field: 'added-by-someone-else' },
                  updated_at: 'CHANGED-' + state.row.updated_at,
                };
              }
              return { data: readSnapshot, error: null };
            },
          }),
        }),
        update: (patch) => {
          const conditions = {};
          const builder = {
            eq: (col, val) => {
              conditions[col] = val;
              return builder;
            },
            is: (col, val) => ({
              select: () => ({
                maybeSingle: async () => {
                  if (conditions.id !== undefined && conditions.id !== state.row.id) {
                    return { data: null, error: null };
                  }
                  if (conditions.updated_at !== undefined && conditions.updated_at !== state.row.updated_at) {
                    // CAS mismatch: the row changed since it was read. Matching real
                    // PostgREST behavior -- 0 rows matched, no write performed.
                    return { data: null, error: null };
                  }
                  if (col === 'integration_operationalization' && state.row[col] !== val) {
                    return { data: null, error: null };
                  }
                  state.row = { ...state.row, ...patch };
                  return { data: { id: state.row.id }, error: null };
                },
              }),
            }),
          };
          return builder;
        },
      };
    },
  };
}

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-012: writeBackfillRow metadata preservation (the incident regression test)', () => {
  it('preserves ALL pre-existing metadata keys -- the exact assertion that would have caught the incident', async () => {
    const priorMetadata = {
      plan_handoff: { handoff_id: 'x' },
      design_analysis: { verdict: 'PASS' },
      database_analysis: { verdict: 'PASS' },
      sd_key: 'SD-EXAMPLE-001',
    };
    const sb = makeWriteFakeSupabase({ id: 'prd-1', integration_operationalization: null, metadata: priorMetadata });

    const result = await writeBackfillRow(sb, 'prd-1', { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    // THE ASSERTION: every pre-existing key survives.
    for (const key of Object.keys(priorMetadata)) {
      expect(sb.state.row.metadata).toHaveProperty(key);
      expect(sb.state.row.metadata[key]).toEqual(priorMetadata[key]);
    }
    // AND the provenance marker is added.
    expect(sb.state.row.metadata.integration_backfill).toBeDefined();
    expect(sb.state.row.metadata.integration_backfill.sd).toBe('SD-LEARN-FIX-ADDRESS-PAT-LES-012');
  });

  it('handles a row with genuinely empty prior metadata (no keys to preserve, still adds provenance)', async () => {
    const sb = makeWriteFakeSupabase({ id: 'prd-2', integration_operationalization: null, metadata: {} });
    const result = await writeBackfillRow(sb, 'prd-2', { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null });
    expect(result.ok).toBe(true);
    expect(Object.keys(sb.state.row.metadata)).toEqual(['integration_backfill']);
  });

  it('handles a row with null metadata (not an object) without throwing', async () => {
    const sb = makeWriteFakeSupabase({ id: 'prd-3', integration_operationalization: null, metadata: null });
    const result = await writeBackfillRow(sb, 'prd-3', { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null });
    expect(result.ok).toBe(true);
    expect(sb.state.row.metadata.integration_backfill).toBeDefined();
  });

  it('writes the integration_operationalization placeholder alongside the merged metadata', async () => {
    const placeholder = { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null };
    const sb = makeWriteFakeSupabase({ id: 'prd-4', integration_operationalization: null, metadata: { existing: true } });
    await writeBackfillRow(sb, 'prd-4', placeholder);
    expect(sb.state.row.integration_operationalization).toEqual(placeholder);
  });

  it('does not write when the row is no longer NULL (concurrent-write guard)', async () => {
    const sb = makeWriteFakeSupabase({ id: 'prd-5', integration_operationalization: { already: 'set' }, metadata: { existing: true } });
    const result = await writeBackfillRow(sb, 'prd-5', { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null });
    expect(result.ok).toBe(true);
    expect(result.written).toBe(false);
    // Metadata must be untouched -- the guard prevented the write entirely.
    expect(sb.state.row.metadata).toEqual({ existing: true });
  });

  it('ADVERSARIAL SHIP-REVIEW FINDING (PR #8950, WARNING #4): the updated_at CAS guard rejects the write when a concurrent writer touches the row between read and write, instead of silently clobbering the concurrent write', async () => {
    const priorMetadata = { plan_handoff: { handoff_id: 'x' }, sd_key: 'SD-EXAMPLE-001' };
    const sb = makeWriteFakeSupabase(
      { id: 'prd-6', integration_operationalization: null, metadata: priorMetadata },
      { simulateConcurrentWriteAfterRead: true }
    );

    const result = await writeBackfillRow(sb, 'prd-6', { consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null });

    // The write must be REJECTED, not silently applied with the concurrent writer's
    // content clobbered by our stale-read-based mergedMetadata.
    expect(result.ok).toBe(true);
    expect(result.written).toBe(false);
    // The concurrent writer's addition survives untouched -- proof the CAS guard fired
    // BEFORE any write landed, not that we happened to merge it in.
    expect(sb.state.row.metadata.concurrent_writer_field).toBe('added-by-someone-else');
    expect(sb.state.row.metadata.plan_handoff).toEqual(priorMetadata.plan_handoff);
    // AND our own provenance marker was never added, since the write never happened.
    expect(sb.state.row.metadata.integration_backfill).toBeUndefined();
    // AND integration_operationalization was never touched either -- this row still
    // needs a future run to backfill it once the race clears.
    expect(sb.state.row.integration_operationalization).toBeNull();
  });
});
