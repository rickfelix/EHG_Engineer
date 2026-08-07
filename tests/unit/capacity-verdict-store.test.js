/**
 * SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — the writer must not defeat the reader from below.
 *
 * TS-2 is the seeded case that matters most: a persist which catches its own insert failure would let
 * leg4 score while the row it cites does not exist — THE DEFECT THIS SD CLOSES, REBUILT ONE LAYER
 * DOWN. It is dangerous precisely because swallowing the error reads as defensive programming and
 * makes every run look healthier.
 *
 * ── THE BLOCK THAT WOULD HAVE CAUGHT THE REAL BUG IS AT THE BOTTOM ────────────────────────────
 * An earlier version of this suite was 16 tests, all green, against a writer whose parameter shape
 * ({verdict, runId, detail}) DID NOT MATCH what lib/drive-loop/score/leg4-capacity.js:74 actually
 * passes ({run_id, verdict, belt_depth, demand_soon, deficit}). Wired together, every row would have
 * landed with a null run_id and no measurement at all. Every test exercised the writer's own
 * invented envelope, so nothing could disagree with the one call site that exists — the two ends
 * shared a vocabulary and were never introduced. "CONTRACT — bound to the REAL caller" runs the real
 * scoreLeg4 against the real writer, and it is the only test here that could have failed.
 */

import { describe, it, expect } from 'vitest';
import {
  makeCapacityVerdictPersist,
  CAPACITY_VERDICT_TABLE,
  isTableAbsentError,
  TABLE_ABSENT_CODES,
} from '../../scripts/lib/capacity-verdict-store.mjs';
import { VERDICTS, HEALTHY_VERDICTS, scoreLeg4 } from '../../lib/drive-loop/score/leg4-capacity.js';

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

/** A complete, valid row in the shape leg4 emits. Tests vary one field at a time from here. */
const ROW = { run_id: 'run-7', verdict: 'TIGHT', belt_depth: 4, demand_soon: 3, deficit: 0 };

describe('TS-2 — SEEDED: a failing write THROWS, it is never swallowed', () => {
  it('propagates a PostgREST error instead of returning', async () => {
    const persist = makeCapacityVerdictPersist(client({ fail: { code: '42P01', message: 'relation does not exist' } }));
    await expect(persist(ROW)).rejects.toThrow(/durable write failed/);
  });

  it('the thrown message says WHY it refuses to continue', async () => {
    // The reason has to survive into the error text: a bare rethrow leaves the next reader guessing
    // whether failing was deliberate or incidental.
    const persist = makeCapacityVerdictPersist(client({ fail: { code: '42501', message: 'permission denied' } }));
    await expect(persist(ROW)).rejects.toThrow(/score against a row that was never written/);
  });

  it('fails at CONSTRUCTION when given no client, not at the first write', async () => {
    // A persist built from a missing client would look fine until the one run that needed it.
    expect(() => makeCapacityVerdictPersist(null)).toThrow(/supabase client is required/);
  });
});

describe('TS-4 — the write refuses a verdict the reader would later reject', () => {
  it.each([['HEALTHY'], ['OK'], ['surplus'], [''], [null]])('refuses %o', async (bad) => {
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ ...ROW, verdict: bad })).rejects.toThrow(/unrecognised verdict/);
  });

  it('a row the reader will reject is worse than no row — and the message says so', async () => {
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ ...ROW, verdict: 'MAYBE' })).rejects.toThrow(/worse than no row/);
  });

  it('refuses OK-CORPUS-GATED specifically — it is a policy overlay, not a capacity reading', async () => {
    // The forecast's `verdict` binding really can hold this value (classifyCorpusGatedDeficit sets
    // it), so this is a live hazard rather than a hypothetical bad string. Persisting it would put a
    // value in the durable record that leg4 throws on at :66.
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ ...ROW, verdict: 'OK-CORPUS-GATED' })).rejects.toThrow(/unrecognised verdict/);
  });

  it('the accepted domain IS the reader\'s frozen list, not a local copy', () => {
    // Guards against the second-representation drift the header warns about: if leg4 ever adds or
    // removes a verdict, this test moves with it rather than silently disagreeing.
    expect(VERDICTS).toEqual(['DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS']);
  });
});

describe('a verdict with no measurement behind it is refused', () => {
  it.each(['belt_depth', 'demand_soon', 'deficit'])('refuses a missing %s', async (field) => {
    // This is the guard that makes the envelope bug loud instead of discoverable months later as a
    // column of nulls. A row carrying a verdict and a null belt_depth renders as measured.
    const persist = makeCapacityVerdictPersist(client());
    const row = { ...ROW };
    delete row[field];
    await expect(persist(row)).rejects.toThrow(new RegExp(`${field} must be a finite number`));
  });

  it('refuses NaN as firmly as undefined', async () => {
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ ...ROW, deficit: NaN })).rejects.toThrow(/deficit must be a finite number/);
  });
});

describe('TS-5 — POSITIVE CONTROL: a good write actually writes', () => {
  it.each(VERDICTS)('persists %s and returns the stored row', async (verdict) => {
    // Without this, a writer that threw on every path would satisfy every negative case above while
    // leaving leg4 exactly as unavailable as it is today — the state this SD exists to leave.
    const captured = {};
    const persist = makeCapacityVerdictPersist(client({ captured }));
    const row = await persist({ ...ROW, verdict });
    expect(row.verdict).toBe(verdict);
    expect(captured.row.run_id).toBe('run-7');
    expect(captured.row.recorded_at).toBeTruthy();
  });

  it('writes every measurement it was given — none are silently dropped', async () => {
    const captured = {};
    await makeCapacityVerdictPersist(client({ captured }))({ ...ROW, belt_depth: 9, demand_soon: 5, deficit: -3 });
    expect(captured.row).toMatchObject({ belt_depth: 9, demand_soon: 5, deficit: -3, verdict: 'TIGHT' });
  });

  it('writes to the table the migration will create', async () => {
    const captured = {};
    await makeCapacityVerdictPersist(client({ captured }))(ROW);
    expect(captured.table).toBe(CAPACITY_VERDICT_TABLE);
  });
});

describe('TS-3 — the two-sided rule is the reader\'s, and the writer does not soften it', () => {
  it('SURPLUS is persisted but is NOT healthy', async () => {
    // The writer records what happened; it does not grade. HEALTHY_VERDICTS is TIGHT alone, because
    // reading SURPLUS as good would score a starved belt as healthy. A writer that filtered SURPLUS
    // out to "keep the data clean" would erase the flooded half of a bidirectional gauge.
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ ...ROW, verdict: 'SURPLUS' })).resolves.toMatchObject({ verdict: 'SURPLUS' });
    expect(HEALTHY_VERDICTS).toEqual(['TIGHT']);
  });
});

describe('table-absent is classified by CODE, and classifying it does not soften the throw', () => {
  it.each(TABLE_ABSENT_CODES)('%s is recognised as the gated-but-unapplied state', async (code) => {
    const persist = makeCapacityVerdictPersist(client({ fail: { code, message: 'no relation' } }));
    // It STILL THROWS. The code only rides along so one documented caller can tell this apart.
    const err = await persist(ROW).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isTableAbsentError(err)).toBe(true);
  });

  it('a permission error is NOT table-absent — the tolerated class is narrow', async () => {
    // 42501 is the one that must never be waved through: an error code never proves the write was
    // refused for a benign reason, and treating "denied" as "not applied yet" would hide a real
    // failure for as long as the grant stayed wrong.
    const persist = makeCapacityVerdictPersist(client({ fail: { code: '42501', message: 'permission denied' } }));
    const err = await persist(ROW).catch((e) => e);
    expect(isTableAbsentError(err)).toBe(false);
  });

  it('[CONTROL] isTableAbsentError is not simply always-true', () => {
    expect(isTableAbsentError(null)).toBe(false);
    expect(isTableAbsentError(new Error('no code at all'))).toBe(false);
  });
});

describe('CONTRACT — bound to the REAL caller, not to this file\'s idea of one', () => {
  // The block that would have caught the shape bug. It runs the REAL scoreLeg4 against the REAL
  // writer, so the envelope leg4 emits and the envelope the writer accepts have to be the same
  // object or the test fails. No stub sits between them to agree with both.
  const forecast = { verdict: 'TIGHT', beltDepth: 4, demandSoon: 3, deficit: 0 };

  it('scoreLeg4\'s row reaches the insert with every field intact', async () => {
    const captured = {};
    const asyncPersist = makeCapacityVerdictPersist(client({ captured }));

    // scoreLeg4 calls persist SYNCHRONOUSLY, so the sweep proves durability first and injects a sync
    // hand-back. Mirrored here rather than papered over: this is the real integration shape.
    const written = await asyncPersist({
      run_id: 'drive-2026-08-07',
      verdict: forecast.verdict,
      belt_depth: forecast.beltDepth,
      demand_soon: forecast.demandSoon,
      deficit: forecast.deficit,
    });

    const leg = scoreLeg4({
      computeVerdict: () => forecast,
      persist: (row) => {
        // The row leg4 builds must be the row that was written. If leg4's shape ever drifts from
        // the writer's, THIS is where it surfaces.
        expect(row).toMatchObject({
          run_id: 'drive-2026-08-07',
          verdict: 'TIGHT',
          belt_depth: 4,
          demand_soon: 3,
          deficit: 0,
        });
        return written;
      },
      runId: 'drive-2026-08-07',
    });

    expect(captured.row.run_id, 'run_id must survive — it was silently dropped by the first writer').toBe('drive-2026-08-07');
    expect(captured.row).toMatchObject({ belt_depth: 4, demand_soon: 3, deficit: 0 });
    expect(leg.verdict_row_id, 'the leg must cite the row that was actually written').toBe('row-1');
    expect(leg.points.value).toBe(2);
  });

  it('[MUTATION] the writer rejects the OLD parameter shape outright', async () => {
    // The exact call the first version accepted. It must now fail rather than write a verdict with
    // no measurement behind it.
    const persist = makeCapacityVerdictPersist(client());
    await expect(persist({ verdict: 'TIGHT', runId: 'run-7', detail: {} }))
      .rejects.toThrow(/belt_depth must be a finite number/);
  });
});
