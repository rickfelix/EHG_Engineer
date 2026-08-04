/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the writer must not defeat the reader from below.
 *
 * TS-2 is the seeded case that matters most: a persist which catches its own insert failure would let
 * leg4 score while the row it cites does not exist — THE DEFECT THIS SD CLOSES, REBUILT ONE LAYER
 * DOWN. It is dangerous precisely because swallowing the error reads as defensive programming and
 * makes every run look healthier.
 */

import { describe, it, expect } from 'vitest';
import { makeCapacityVerdictPersist, CAPACITY_VERDICT_TABLE } from '../../lib/drive-loop/capacity-verdict-store.js';
import { VERDICTS, HEALTHY_VERDICTS } from '../../lib/drive-loop/score/leg4-capacity.js';

/** Minimal supabase double. `fail` makes the insert return a PostgREST-shaped error. */
const client = ({ fail = null, captured = {} } = {}) => ({
  captured,
  from(table) {
    captured.table = table;
    return {
      insert(row) {
        captured.row = row;
        return {
          select() {
            return {
              single: async () => (fail
                ? { data: null, error: fail }
                : { data: { id: 'row-1', verdict: row.verdict, recorded_at: row.recorded_at }, error: null }),
            };
          },
        };
      },
    };
  },
});

describe('TS-2 — SEEDED: a failing write THROWS, it is never swallowed', () => {
  it('propagates a PostgREST error instead of returning', async () => {
    const persist = makeCapacityVerdictPersist(client({ fail: { code: '42P01', message: 'relation does not exist' } }));
    await expect(persist({ verdict: 'TIGHT' })).rejects.toThrow(/durable write failed/);
  });

  it('the thrown message says WHY it refuses to continue', async () => {
    // The reason has to survive into the error text: a bare rethrow leaves the next reader guessing
    // whether failing was deliberate or incidental.
    const persist = makeCapacityVerdictPersist(client({ fail: { code: '42501', message: 'permission denied' } }));
    await expect(persist({ verdict: 'DEFICIT' })).rejects.toThrow(/score against a row that was never written/);
  });

  it('fails at CONSTRUCTION when given no client, not at the first write', async () => {
    // A persist built from a missing client would look fine until the one run that needed it.
    expect(() => makeCapacityVerdictPersist(null)).toThrow(/supabase client is required/);
  });
});

describe('TS-4 — the write refuses a verdict the reader would later reject', () => {
  it.each([['HEALTHY'], ['OK'], ['surplus'], [''], [null]])('refuses %o', async (bad) => {
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ verdict: bad })).rejects.toThrow(/unrecognised verdict/);
  });

  it('a row the reader will reject is worse than no row — and the message says so', async () => {
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ verdict: 'MAYBE' })).rejects.toThrow(/worse than no row/);
  });

  it('the accepted domain IS the reader\'s frozen list, not a local copy', () => {
    // Guards against the second-representation drift the header warns about: if leg4 ever adds or
    // removes a verdict, this test moves with it rather than silently disagreeing.
    expect(VERDICTS).toEqual(['DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS']);
  });
});

describe('TS-5 — POSITIVE CONTROL: a good write actually writes', () => {
  it.each(VERDICTS)('persists %s and returns the stored row', async (verdict) => {
    // Without this, a writer that threw on every path would satisfy every negative case above while
    // leaving leg4 exactly as unavailable as it is today — the state this SD exists to leave.
    const captured = {};
    const persist = makeCapacityVerdictPersist(client({ captured }));
    const row = await persist({ verdict, runId: 'run-7' });
    expect(row.verdict).toBe(verdict);
    expect(captured.row.run_id).toBe('run-7');
    expect(captured.row.recorded_at).toBeTruthy();
  });

  it('writes to the table the migration will create', async () => {
    const captured = {};
    await makeCapacityVerdictPersist(client({ captured }))({ verdict: 'TIGHT' });
    expect(captured.table).toBe(CAPACITY_VERDICT_TABLE);
  });
});

describe('TS-3 — the two-sided rule is the reader\'s, and the writer does not soften it', () => {
  it('SURPLUS is persisted but is NOT healthy', async () => {
    // The writer records what happened; it does not grade. HEALTHY_VERDICTS is TIGHT alone, because
    // reading SURPLUS as good would score a starved belt as healthy. A writer that filtered SURPLUS
    // out to "keep the data clean" would erase the flooded half of a bidirectional gauge.
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ verdict: 'SURPLUS' })).resolves.toMatchObject({ verdict: 'SURPLUS' });
    expect(HEALTHY_VERDICTS).toEqual(['TIGHT']);
  });
});
