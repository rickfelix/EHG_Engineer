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
import { reconcileBoard } from '../../../scripts/adam-quiet-tick.mjs';

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
