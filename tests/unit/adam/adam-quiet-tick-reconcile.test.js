/**
 * Unit pins for Child B FR-1: board<->reality reconcile wired into the recurring
 * Adam tick (scripts/adam-quiet-tick.mjs's reconcileBoard()), not only at cold start.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B.
 *
 * Mocks supabase (no live DB), mirroring tests/unit/adam/task-rehydrate.test.js's stub
 * pattern, so the reconcile step's actual tick-flow wiring is proven without hitting a
 * real database or spawning a real subprocess. Importing this module is safe because
 * adam-quiet-tick.mjs now guards its main() call behind isMainModule() (fixed alongside
 * this FR — the module previously ran main() unconditionally at import time).
 */
import { describe, it, expect } from 'vitest';
import { reconcileBoard, readCriticalPathParents } from '../../../scripts/adam-quiet-tick.mjs';

/** Read builder: chainable no-op filters, thenable to the seeded rows. */
function readBuilder(data) {
  const b = {
    select: () => b, eq: () => b, in: () => b, is: () => b, not: () => b,
    order: () => b, limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return b;
}

function makeSupabase({ coordination = [], sds = [] } = {}) {
  const ledger = [];
  const keyOf = (r) => `${r.source_kind}|${r.source_ref}`;
  function from(table) {
    if (table === 'adam_task_ledger') {
      return {
        upsert(row) {
          return {
            select() {
              return {
                single: async () => {
                  const existing = ledger.find((r) => keyOf(r) === keyOf(row));
                  if (existing) { Object.assign(existing, row); return { data: existing, error: null }; }
                  const created = { id: `id-${ledger.length + 1}`, status: 'open', ...row };
                  ledger.push(created);
                  return { data: created, error: null };
                },
              };
            },
          };
        },
      };
    }
    if (table === 'session_coordination') return readBuilder(coordination);
    if (table === 'strategic_directives_v2') return readBuilder(sds);
    return readBuilder([]);
  }
  return { from, _ledger: ledger };
}

describe('reconcileBoard', () => {
  it('TS-1: reconciles an open advisory thread into the board, same shape rehydrateBoard() already produces', async () => {
    const sb = makeSupabase({
      coordination: [
        { id: 'sc1', sender_type: 'adam', payload: { correlation_id: 'corr-open', subject: 'Decision needed' } },
      ],
    });
    const result = await reconcileBoard(sb);
    expect(result.errors).toEqual([]);
    expect(result.threads).toBe(1);
    expect(result.parents).toBe(1);
    expect(sb._ledger).toHaveLength(1);
    expect(sb._ledger[0]).toMatchObject({ source_kind: 'advisory_thread', source_ref: 'corr-open' });
  });

  it('is fail-soft: a malformed/missing client never throws, always returns a summary', async () => {
    const result = await reconcileBoard(null);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.threads).toBe(0);
  });

  it('is idempotent: running twice against the same source data does not duplicate nodes', async () => {
    const sb = makeSupabase({
      coordination: [
        { id: 'sc1', sender_type: 'adam', payload: { correlation_id: 'corr-open', subject: 'Decision needed' } },
      ],
    });
    await reconcileBoard(sb);
    await reconcileBoard(sb);
    expect(sb._ledger).toHaveLength(1);
  });
});

/**
 * Unit pins for Child B FR-2/FR-3's tick-side wiring: readCriticalPathParents() is the
 * function main() now calls (SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B)
 * to feed lib/adam/stall-alert.js's checkAndAlertStalls(). Proves the inFlightNextStep
 * derivation (status==='in_progress' -> intended hold, everything else -> stall candidate)
 * and the fail-soft contract, independent of stall-alert.js's own (already-covered) logic.
 */
describe('readCriticalPathParents', () => {
  function ledgerSelect(rows) {
    const b = {
      select: () => b, eq: () => b, in: () => b, order: () => b, // FR-6 batch 9: fetchAllPaginated tiebreaker
      range: () => Promise.resolve({ data: rows, error: null }), // FR-6 batch 9: fetchAllPaginated pages via .range()
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return b;
  }

  it('derives inFlightNextStep=true only for status==="in_progress"', async () => {
    const rows = [
      { id: 'p1', title: 'A', updated_at: 'x', status: 'in_progress' },
      { id: 'p2', title: 'B', updated_at: 'x', status: 'blocked' },
      { id: 'p3', title: 'C', updated_at: 'x', status: 'open' },
    ];
    const sb = { from: (table) => (table === 'adam_task_ledger' ? ledgerSelect(rows) : ledgerSelect([])) };
    const parents = await readCriticalPathParents(sb);
    expect(parents.find((p) => p.id === 'p1').inFlightNextStep).toBe(true);
    expect(parents.find((p) => p.id === 'p2').inFlightNextStep).toBe(false);
    expect(parents.find((p) => p.id === 'p3').inFlightNextStep).toBe(false);
  });

  it('is fail-soft: a throwing/malformed client returns an empty array, never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    await expect(readCriticalPathParents(sb)).resolves.toEqual([]);
  });

  it('QF-20260711-503: self-heals a STALE parent status before reading it — 6/7 children done + 1 open no longer false-escalates', async () => {
    const ledger = [
      { id: 'p1', title: 'UX remediation', updated_at: 'x', tier: 'parent', status: 'blocked' }, // stale
      ...Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, tier: 'child', parent_id: 'p1', status: 'done' })),
      { id: 'c6', tier: 'child', parent_id: 'p1', status: 'open' }, // remaining child, claimable on the belt
    ];
    function filteredSelect() {
      const filters = [];
      const b = {
        select: () => b,
        eq(col, val) { filters.push((r) => r[col] === val); return b; },
        in(col, vals) { filters.push((r) => vals.includes(r[col])); return b; },
        order: () => b, // FR-6 batch 9: fetchAllPaginated tiebreaker
        range: () => Promise.resolve({ data: ledger.filter((r) => filters.every((f) => f(r))), error: null }), // FR-6 batch 9
        then: (resolve, reject) => Promise.resolve({ data: ledger.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject),
      };
      return b;
    }
    const sb = {
      from: (table) => {
        if (table !== 'adam_task_ledger') throw new Error(`unexpected table: ${table}`);
        return {
          ...filteredSelect(),
          update(patch) {
            return { eq: (_c, id) => ({ select: () => ({ maybeSingle: async () => {
              const row = ledger.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return { data: row ?? null, error: null };
            } }) }) };
          },
        };
      },
    };
    const parents = await readCriticalPathParents(sb);
    expect(ledger.find((r) => r.id === 'p1').status).toBe('in_progress'); // persisted, not just read
    expect(parents.find((p) => p.id === 'p1').inFlightNextStep).toBe(true); // stall-alert now sees an intended hold
  });
});
