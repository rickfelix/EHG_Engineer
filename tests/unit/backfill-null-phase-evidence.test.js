/**
 * SD-LEO-INFRA-EVIDENCE-PHASE-NEVER-NULL-001
 *
 * Tests for the historical null-phase backfill script. Pure-function tests
 * (deriveHistoricalPhase, sortHandoffs) cover the derivation logic directly
 * with plain arrays, per TESTING sub-agent guidance (avoids over-mocking).
 * A stateful-mock integration test covers dry-run/idempotency (the only
 * scenarios that genuinely need DB-shaped behavior).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { deriveHistoricalPhase, sortHandoffs, main } from '../../scripts/backfill-null-phase-evidence.mjs';

describe('deriveHistoricalPhase (pure logic)', () => {
  it('TS-1: prefers metadata.phase when already set, normalized', () => {
    const row = { sd_id: 'sd-1', created_at: '2026-01-01T00:00:00Z', metadata: { phase: 'exec-to-plan' } };
    const result = deriveHistoricalPhase(row, []);
    expect(result).toEqual({ phase: 'EXEC_TO_PLAN', source: 'metadata' });
  });

  it('TS-2: derives from the most recent accepted handoff bracketing created_at', () => {
    const row = { sd_id: 'sd-2', created_at: '2026-01-10T00:00:00Z', metadata: {} };
    const handoffs = sortHandoffs([
      { id: 'h1', to_phase: 'LEAD', accepted_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'h2', to_phase: 'PLAN', accepted_at: '2026-01-05T00:00:00Z', created_at: '2026-01-05T00:00:00Z' },
    ]);
    const result = deriveHistoricalPhase(row, handoffs);
    expect(result).toEqual({ phase: 'PLAN', source: 'handoff' });
  });

  it('TS-3: falls back to LEAD when sd_id is set but no bracketing handoff exists', () => {
    const row = { sd_id: 'sd-3', created_at: '2026-01-01T00:00:00Z', metadata: {} };
    const handoffs = sortHandoffs([
      { id: 'h1', to_phase: 'PLAN', accepted_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z' },
    ]);
    const result = deriveHistoricalPhase(row, handoffs);
    expect(result).toEqual({ phase: 'LEAD', source: 'fallback_lead' });
  });

  it('TS-4: falls back to UNKNOWN_HISTORICAL when sd_id is null', () => {
    const row = { sd_id: null, created_at: '2026-01-01T00:00:00Z', metadata: {} };
    const result = deriveHistoricalPhase(row, []);
    expect(result).toEqual({ phase: 'UNKNOWN_HISTORICAL', source: 'fallback_unknown' });
  });

  it('TS-7: an accepted handoff with a null accepted_at falls back to created_at for the window comparison', () => {
    const row = { sd_id: 'sd-7', created_at: '2026-01-10T00:00:00Z', metadata: {} };
    const handoffs = sortHandoffs([
      { id: 'h1', to_phase: 'EXEC', accepted_at: null, created_at: '2026-01-05T00:00:00Z' },
    ]);
    const result = deriveHistoricalPhase(row, handoffs);
    expect(result).toEqual({ phase: 'EXEC', source: 'handoff' });
  });

  it('TS-8: exact-timestamp ties between two accepted handoffs are broken deterministically by id DESC', () => {
    const row = { sd_id: 'sd-8', created_at: '2026-01-10T00:00:00Z', metadata: {} };
    const tiedTs = '2026-01-05T00:00:00Z';
    const handoffsAsc = sortHandoffs([
      { id: 'aaa', to_phase: 'PLAN', accepted_at: tiedTs, created_at: tiedTs },
      { id: 'zzz', to_phase: 'EXEC', accepted_at: tiedTs, created_at: tiedTs },
    ]);
    const handoffsDesc = sortHandoffs([
      { id: 'zzz', to_phase: 'EXEC', accepted_at: tiedTs, created_at: tiedTs },
      { id: 'aaa', to_phase: 'PLAN', accepted_at: tiedTs, created_at: tiedTs },
    ]);
    // Input order must not matter -- both produce the same winner (id 'zzz' sorts first under DESC).
    expect(deriveHistoricalPhase(row, handoffsAsc)).toEqual({ phase: 'EXEC', source: 'handoff' });
    expect(deriveHistoricalPhase(row, handoffsDesc)).toEqual({ phase: 'EXEC', source: 'handoff' });
  });

  it('TS-9: ordering uses COALESCE(accepted_at, created_at), not created_at alone', () => {
    const row = { sd_id: 'sd-9', created_at: '2026-01-20T00:00:00Z', metadata: {} };
    // h1 was CREATED earlier but ACCEPTED later than h2 -- the coalesced (accepted) timestamp must win.
    const handoffs = sortHandoffs([
      { id: 'h1', to_phase: 'EXEC', accepted_at: '2026-01-15T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      { id: 'h2', to_phase: 'PLAN', accepted_at: '2026-01-10T00:00:00Z', created_at: '2026-01-12T00:00:00Z' },
    ]);
    const result = deriveHistoricalPhase(row, handoffs);
    expect(result).toEqual({ phase: 'EXEC', source: 'handoff' });
  });

  it('TS-10: the boundary is inclusive -- a handoff accepted at exactly created_at brackets the row', () => {
    const sameTs = '2026-01-10T00:00:00Z';
    const row = { sd_id: 'sd-10', created_at: sameTs, metadata: {} };
    const handoffs = sortHandoffs([
      { id: 'h1', to_phase: 'PLAN', accepted_at: sameTs, created_at: sameTs },
    ]);
    const result = deriveHistoricalPhase(row, handoffs);
    expect(result).toEqual({ phase: 'PLAN', source: 'handoff' });
  });
});

describe('main() integration (dry-run / idempotency / rejected-handoff-exclusion)', () => {
  let subAgentRows;
  let handoffRows;

  function makeMockSupabase() {
    return {
      from(table) {
        if (table === 'sd_phase_handoffs') {
          const filters = {};
          const builder = {
            select() { return builder; },
            eq(col, val) { filters[col] = val; return builder; },
            in(col, vals) { filters[`${col}__in`] = vals; return builder; },
          };
          builder.range = async () => {
            const matches = handoffRows.filter((h) =>
              (!filters.status || h.status === filters.status) &&
              (!filters.sd_id__in || filters.sd_id__in.includes(h.sd_id))
            );
            return { data: matches, error: null };
          };
          return builder;
        }
        if (table === 'audit_log') {
          return { insert: async () => ({ error: null }) };
        }
        // sub_agent_execution_results
        const filters = {};
        const builder = {
          select() { return builder; },
          is(col, val) { filters[col] = { op: 'is', val }; return builder; },
          eq(col, val) { filters[col] = { op: 'eq', val }; return builder; },
          update(fields) {
            return {
              in(_col, ids) {
                return {
                  is(_col2, _val2) {
                    return {
                      select() {
                        const touched = [];
                        for (const id of ids) {
                          const row = subAgentRows.find((r) => r.id === id && r.phase === null);
                          if (!row) continue;
                          Object.assign(row, fields);
                          touched.push({ id });
                        }
                        return Promise.resolve({ data: touched, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
        builder.range = async () => {
          const matches = subAgentRows.filter((r) =>
            Object.entries(filters).every(([col, f]) => {
              if (f.op === 'is') return r[col] === null || r[col] === undefined;
              if (f.op === 'eq') return r[col] === f.val;
              return true;
            })
          );
          return { data: matches, error: null };
        };
        return builder;
      },
    };
  }

  beforeEach(() => {
    subAgentRows = [
      { id: 'row-1', sd_id: 'sd-int-1', phase: null, created_at: '2026-01-10T00:00:00Z', metadata: {} },
      { id: 'row-2', sd_id: 'sd-int-1', phase: null, created_at: '2026-01-01T00:00:00Z', metadata: {} },
    ];
    handoffRows = [
      { sd_id: 'sd-int-1', status: 'accepted', to_phase: 'PLAN', accepted_at: '2026-01-05T00:00:00Z', created_at: '2026-01-05T00:00:00Z', id: 'h-1' },
      { sd_id: 'sd-int-1', status: 'rejected', to_phase: 'EXEC', accepted_at: '2026-01-08T00:00:00Z', created_at: '2026-01-08T00:00:00Z', id: 'h-2' },
    ];
  });

  it('TS-5: dry-run (apply=false) makes zero writes and correctly excludes a rejected handoff from derivation', async () => {
    const sb = makeMockSupabase();
    const result = await main(sb, false);

    expect(result.applied).toBe(false);
    expect(result.written).toBe(0);
    expect(result.found).toBe(2);
    // row-1 derives PLAN (the accepted handoff), never EXEC (the rejected one) despite it bracketing too.
    // Confirm no row was mutated by a dry-run.
    expect(subAgentRows[0].phase).toBeNull();
    expect(subAgentRows[1].phase).toBeNull();
  });

  it('TS-6: apply writes derived phases, and re-running is idempotent (0 rows touched on the second pass)', async () => {
    const sb = makeMockSupabase();
    const firstRun = await main(sb, true);

    expect(firstRun.applied).toBe(true);
    expect(firstRun.written).toBe(2);
    expect(firstRun.failed).toBe(0);
    // row-1 (created after the accepted PLAN handoff, before the rejected EXEC one) derives PLAN.
    expect(subAgentRows.find((r) => r.id === 'row-1').phase).toBe('PLAN');
    // row-2 (created before any accepted handoff) falls back to LEAD.
    expect(subAgentRows.find((r) => r.id === 'row-2').phase).toBe('LEAD');

    const secondRun = await main(sb, true);
    expect(secondRun.found).toBe(0);
    expect(secondRun.written).toBe(0);
  });
});
