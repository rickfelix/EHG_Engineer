/**
 * G2 (PLAN TESTING, re-review) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * THE GAP THIS CLOSES, in the reviewer's words: the "distinct kind, so neither can suppress the
 * other" property was asserted ONLY on detectReaperStarvation's return value. Two independent
 * mutations each survived all 748 coordinator tests — hardcoding the emitter's dedup key, and
 * cutting `kind: res.alertKind` out of the surfacing pass-through. Under either, an open starvation
 * alert silences a census-blind alert for 24h: precisely the outcome S3 exists to prevent. Grep
 * confirmed emitReaperStarvationAlert and runReaperStarvationSurfacing had NO test references at all.
 *
 * GREEN PRODUCER, GREEN CONSUMER-IN-PRINCIPLE, UNVERIFIED WIRE. detectReaperStarvation returning a
 * distinct alertKind proves nothing on its own — the kind has to survive the pass-through AND be the
 * thing the dedup query actually keys on. Both ends were green; nobody measured the wire between.
 *
 * So these tests assert the value that ARRIVES at the database row, not the value that left the
 * detector. That is the only assertion the two mutations above cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  emitReaperStarvationAlert, runReaperStarvationSurfacing, REAPER_STARVATION_THRESHOLD,
} = require_('../../../lib/coordinator/coordination-events.cjs');

const STARVATION = 'reaper_starvation_alert';
const BLIND = 'reaper_census_blind_alert';
const T = REAPER_STARVATION_THRESHOLD;

/**
 * Serves the dedup lookup ONLY rows whose kind matches the filter the emitter actually applied.
 * That is what makes a hardcoded dedup key detectable: if the emitter stops keying on the kind it
 * was asked to emit, it starts seeing the OTHER kind's open row and skips.
 */
function stubSupabase({ openAlerts = [] } = {}) {
  const inserted = [];
  const filters = [];
  const sb = {
    from(table) {
      const chain = {
        _isSelect: false, _kind: undefined,
        select() { chain._isSelect = true; return chain; },
        eq(col, val) {
          filters.push({ table, col, val });
          if (String(col).includes('kind')) chain._kind = val;
          return chain;
        },
        is() { return chain; },
        gt() { return chain; },
        in() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        single() { return Promise.resolve({ data: { id: 'new-row' }, error: null }); },
        insert(r) { inserted.push(r); chain._isSelect = false; return chain; },
        then(res, rej) {
          if (chain._isSelect) {
            const hits = openAlerts
              .filter((k) => k === chain._kind)
              .map((k) => ({ id: `open-${k}` }));
            return Promise.resolve({ data: hits, error: null }).then(res, rej);
          }
          return Promise.resolve({ data: { id: 'new-row' }, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted, filters };
}

const evidence = (over = {}) => ({
  consecutive_refusals: T, pool_used: 22, pool_cap: 28, pool_percent: 79, threshold: T, ...over,
});

describe('G2: the two alert kinds de-dupe SEPARATELY at the database, not just in the detector', () => {
  it('POSITIVE CONTROL — an open alert of the SAME kind DOES suppress a duplicate', async () => {
    // Without this, a dedup that never matches anything would pass every test below.
    const { sb, inserted } = stubSupabase({ openAlerts: [STARVATION] });
    const out = await emitReaperStarvationAlert(sb, evidence(), { kind: STARVATION });
    expect(out.skipped).toBe(true);
    expect(inserted).toHaveLength(0);
  });

  it('an open STARVATION alert does NOT suppress a CENSUS-BLIND alert', async () => {
    // The mutation this kills: hardcoding the dedup key. Under it the blind alert finds the open
    // starvation row, skips, and the operator is never told the instrument went blind — for 24h.
    const { sb, inserted } = stubSupabase({ openAlerts: [STARVATION] });
    const out = await emitReaperStarvationAlert(sb, evidence({ pool_used: null }), { kind: BLIND });
    expect(out.skipped).toBeUndefined();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.kind).toBe(BLIND);
  });

  it('and symmetrically: an open CENSUS-BLIND alert does NOT suppress a STARVATION alert', async () => {
    // Asserted in BOTH directions: a one-sided test admits an implementation that special-cases
    // one kind while collapsing the other.
    const { sb, inserted } = stubSupabase({ openAlerts: [BLIND] });
    const out = await emitReaperStarvationAlert(sb, evidence(), { kind: STARVATION });
    expect(out.skipped).toBeUndefined();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.kind).toBe(STARVATION);
  });

  it('the dedup query keys on the payload kind, not on a bare column that does not exist', async () => {
    // Same class as the disposition-lock guard: a column-keyed lookup finds nothing and the dedup
    // is inert while reading as enforced. `kind` lives inside the jsonb payload.
    const { sb, filters } = stubSupabase();
    await emitReaperStarvationAlert(sb, evidence(), { kind: BLIND });
    const kindFilter = filters.find((f) => String(f.col).includes('kind'));
    expect(kindFilter).toBeTruthy();
    expect(kindFilter.col).toBe('payload->>kind');
    expect(kindFilter.val).toBe(BLIND);
  });
});

describe('G2: the surfacing pass-through carries the kind all the way to the row', () => {
  it('an UNREADABLE pool surfaces as a CENSUS-BLIND row — the kind survives the wire', async () => {
    // The mutation this kills: dropping `kind: res.alertKind` from the emitter call in
    // runReaperStarvationSurfacing. The detector still returns the right kind; the row gets the
    // default. Asserting the detector's return value cannot see that. Asserting the ROW can.
    const { sb, inserted } = stubSupabase();
    const res = await runReaperStarvationSurfacing(sb, {
      consecutiveRefusals: T * 3, pool: { used: null, cap: 28 },
    });
    expect(res.matched).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.kind).toBe(BLIND);
    expect(inserted[0].subject).toMatch(/REAPER_CENSUS_BLIND/);
  });

  it('a genuine starvation still surfaces as a STARVATION row — the negative arm', async () => {
    const { sb, inserted } = stubSupabase();
    const res = await runReaperStarvationSurfacing(sb, {
      consecutiveRefusals: T, pool: { used: 22, cap: 28, percent: 79 },
    });
    expect(res.matched).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.kind).toBe(STARVATION);
    expect(inserted[0].subject).toMatch(/REAPER_STARVATION/);
  });

  it('a non-matching outcome writes NOTHING', async () => {
    // Anti-vacuity for this file: an emitter that always inserted would pass every test above.
    const { sb, inserted } = stubSupabase();
    const res = await runReaperStarvationSurfacing(sb, {
      consecutiveRefusals: T, pool: { used: 0, cap: 28, percent: 0 },
    });
    expect(res.matched).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});
