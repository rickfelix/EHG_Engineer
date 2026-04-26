/**
 * Vitest spec for the s17_heartbeat prune script.
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM F (TR-2)
 */

import { describe, it, expect } from 'vitest';
import { pruneExpiredHeartbeats } from './prune-s17-heartbeats.mjs';

function makeSupabaseMock(rows = []) {
  const calls = [];
  return {
    from(_table) {
      const filters = {};
      const ltFilters = {};
      const builder = {
        select() { return builder; },
        eq(col, val) { filters[col] = val; return builder; },
        lt(col, val) { ltFilters[col] = val; return builder; },
        async then(resolve) {
          // Allow `await sb.from(...).select().eq().lt()` to resolve.
          calls.push({ op: 'select', filters: { ...filters }, ltFilters: { ...ltFilters } });
          const matches = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            for (const [k, v] of Object.entries(ltFilters)) {
              const path = k.split('->>');
              if (path.length === 2) {
                const fieldVal = r[path[0]]?.[path[1]];
                if (!(fieldVal < v)) return false;
              }
            }
            return true;
          });
          resolve({ data: matches, error: null });
        },
        delete() {
          return {
            async in(col, ids) {
              calls.push({ op: 'delete', col, ids });
              for (const id of ids) {
                const idx = rows.findIndex((r) => r.id === id);
                if (idx !== -1) rows.splice(idx, 1);
              }
              return { error: null };
            },
          };
        },
      };
      return builder;
    },
    _rows: () => rows,
    _calls: () => calls,
  };
}

describe('pruneExpiredHeartbeats', () => {
  const fixedNow = () => new Date('2026-04-26T12:00:00.000Z');

  it('returns {pruned:0} when no rows match', async () => {
    const sb = makeSupabaseMock([]);
    const result = await pruneExpiredHeartbeats(sb, { now: fixedNow });
    expect(result).toEqual({ pruned: 0, ids: [] });
  });

  it('deletes rows whose ttlExpiresAt is in the past', async () => {
    const sb = makeSupabaseMock([
      { id: 'h1', artifact_type: 's17_heartbeat', metadata: { ttlExpiresAt: '2026-04-20T00:00:00.000Z' } },
      { id: 'h2', artifact_type: 's17_heartbeat', metadata: { ttlExpiresAt: '2026-04-25T00:00:00.000Z' } },
      { id: 'h3', artifact_type: 's17_heartbeat', metadata: { ttlExpiresAt: '2026-05-01T00:00:00.000Z' } }, // future
    ]);
    const result = await pruneExpiredHeartbeats(sb, { now: fixedNow });
    expect(result.pruned).toBe(2);
    expect(result.ids).toEqual(['h1', 'h2']);
    // Only the future row remains
    expect(sb._rows().map((r) => r.id)).toEqual(['h3']);
  });

  it('honors dryRun: reports without deleting', async () => {
    const sb = makeSupabaseMock([
      { id: 'h1', artifact_type: 's17_heartbeat', metadata: { ttlExpiresAt: '2026-04-20T00:00:00.000Z' } },
    ]);
    const result = await pruneExpiredHeartbeats(sb, { now: fixedNow, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.ids).toEqual(['h1']);
    expect(result.pruned).toBe(0);
    // Row preserved
    expect(sb._rows().length).toBe(1);
  });

  it('does not touch non-heartbeat rows', async () => {
    const sb = makeSupabaseMock([
      { id: 'h1', artifact_type: 's17_heartbeat', metadata: { ttlExpiresAt: '2026-04-20T00:00:00.000Z' } },
      { id: 'a1', artifact_type: 's17_archetypes', metadata: { ttlExpiresAt: '2026-04-20T00:00:00.000Z' } },
    ]);
    const result = await pruneExpiredHeartbeats(sb, { now: fixedNow });
    expect(result.pruned).toBe(1);
    expect(sb._rows().map((r) => r.id).sort()).toEqual(['a1']);
  });
});
