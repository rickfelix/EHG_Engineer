/**
 * SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 — FR-3 (emission + the named consumer).
 *
 * The acceptance criterion is "a named consumer reads the emission and a test asserts its behaviour
 * differs when the emission is present versus absent". So the load-bearing test here is the
 * DIFFERENTIAL against the real renderSourcingStateLines — not an assertion that a function was
 * called. If the badge rendered identically with and without a decision, the emission would be
 * write-only and FR-3 would have shipped as decoration.
 *
 * .test.js, NOT .test.mjs — proven during PLAN that the vitest unit include does not match
 * .test.mjs. The pre-existing tests/unit/adam-sourcing-state-probe.test.mjs, which covers this very
 * renderer, is therefore NEVER EXECUTED by `vitest run --project unit`. A consumer test for FR-3
 * landed beside it would have been a reader that nobody reads — this SD's defect, third instance.
 */
import { describe, it, expect } from 'vitest';
import { renderSourcingStateLines } from '../../../scripts/adam-startup-check.mjs';
import {
  measureDemand, recordDemandDecision, readLastDemandDecision, resolveDemandFloor,
  DEFAULT_DEMAND_FLOOR, DEMAND_GATE_EVENT,
} from '../../../lib/governance/demand-gate-emit.js';
import { decideDemand, normalizeGaugeReading } from '../../../lib/governance/demand-gate.js';

const FLAGS = [{ flag: 'SOURCING_AUTO_REFILL_V1', on: true }];
const withheld = decideDemand(normalizeGaugeReading(9), 3, { engine: 'refill-auto-promote' });
const unmeasurable = decideDemand(normalizeGaugeReading(null), 3, { engine: 'refill-auto-promote' });
const sourced = decideDemand(normalizeGaugeReading(0), 3, { engine: 'refill-auto-promote' });

const render = (demand) => renderSourcingStateLines({ flags: FLAGS, wave: null, backlog: null, demand });

describe('FR-3 DIFFERENTIAL — the badge changes when the emission exists', () => {
  it('present vs absent produce different output', () => {
    const absent = render(null);
    const present = render(withheld);
    expect(present).not.toBe(absent);          // the load-bearing assertion
    expect(absent).toContain('NEVER RAN');
    expect(present).not.toContain('NEVER RAN');
    expect(present).toContain('WITHHELD');
  });

  it('the three states are mutually distinguishable in the rendered badge', () => {
    // Not three separate contains-checks: those all pass against a renderer that prints one
    // constant string plus the decision name. The Set size is what catches a collapse.
    const outs = [render(null), render(withheld), render(unmeasurable), render(sourced)];
    expect(new Set(outs).size).toBe(4);
  });

  it('a withheld run reports the NUMBERS, so the operator can see why it stayed quiet', () => {
    const out = render(withheld);
    expect(out).toContain('gauge=9');
    expect(out).toContain('floor=3');
  });

  it('gauge=0 prints as a measured zero, not as a missing value', () => {
    // measured-and-empty vs never-measured is the distinction the whole FR turns on.
    expect(render(sourced)).toContain('gauge=0');
  });
});

describe('FR-3 the badge names WHICH engine never ran', () => {
  it('per-engine entries render one line each, naming the silent one', () => {
    const out = render([
      { engine: 'refill-auto-promote', decision: withheld },
      { engine: 'fr-c-generator', decision: null },
    ]);
    expect(out).toContain('refill-auto-promote');
    expect(out).toContain('fr-c-generator: NEVER RAN');
  });

  it('SHAPE AMBIGUITY — a bare decision object inside the array does not throw or mis-render', () => {
    // Both shapes carry a `decision` key: a wrapper's is an object/null, a decision's is a STRING.
    // Disambiguating on presence would read 'withheld' as a decision object and crash the badge.
    const out = render([withheld]);
    expect(out).toContain('WITHHELD');
    expect(out).not.toContain('NEVER RAN');
  });
});

describe('measureDemand — an unreadable gauge is never a licence to produce', () => {
  it('a THROWING gauge yields unmeasurable, not a zero belt', () => {
    // belt-depth.cjs is deliberately fail-loud (throwOnError at :78). The tempting bug is
    // catch -> treat as 0 -> "belt empty, produce": a fail-open flood via an exception handler.
    return measureDemand({}, {
      engine: 'e', floor: 3, gauge: async () => { throw new Error('dep query failed'); },
    }).then((d) => {
      expect(d.decision).toBe('unmeasurable');
      expect(d.gauge_value).not.toBe(0);
    });
  });

  it('a healthy gauge below the floor sources — the positive control', async () => {
    const d = await measureDemand({}, { engine: 'e', floor: 3, gauge: async () => ({ dispatchable: 1 }) });
    expect(d.decision).toBe('sourced');
    expect(d.gauge_value).toBe(1);
  });

  it('a healthy gauge above the floor withholds', async () => {
    const d = await measureDemand({}, { engine: 'e', floor: 3, gauge: async () => ({ dispatchable: 12 }) });
    expect(d.decision).toBe('withheld');
  });
});

describe('resolveDemandFloor — misconfiguration must not silently become the default', () => {
  it('absent -> default', () => {
    expect(resolveDemandFloor({})).toBe(DEFAULT_DEMAND_FLOOR);
    expect(resolveDemandFloor({ BELT_DEMAND_FLOOR: '' })).toBe(DEFAULT_DEMAND_FLOOR);
  });

  it('a valid override wins', () => {
    expect(resolveDemandFloor({ BELT_DEMAND_FLOOR: '7' })).toBe(7);
    expect(resolveDemandFloor({ BELT_DEMAND_FLOOR: '0' })).toBe(0);
  });

  it('GARBAGE yields NaN -> unmeasurable, never a silent fallback to the default', () => {
    // Falling back to the default here would mean a typo'd floor produces at the WRONG threshold
    // while reporting a healthy decision. NaN routes through decideDemand's non-finite floor guard.
    const floor = resolveDemandFloor({ BELT_DEMAND_FLOOR: 'lots' });
    expect(Number.isNaN(floor)).toBe(true);
    expect(decideDemand(normalizeGaugeReading(0), floor).decision).toBe('unmeasurable');
  });
});

describe('record/read round trip against a fake client', () => {
  // TESTING review 57879900 (C3): the original stub ignored the table name and returned `this`
  // from eq/order, so the round trip passed because `rows` was shared array state — NOT because
  // the query matched. Six mutations survived it: insert into the wrong table, read from the wrong
  // table, drop .eq(event_type), drop .eq(entity_id), hardcode the wrong entity_id, and flip the
  // sort to ascending (which freezes the badge on the first-ever verdict — a permanently stale
  // gauge that reads healthy). This stub RECORDS the query it was asked for, so those are
  // assertable, and the store is keyed by table + entity_id rather than being one shared array.
  const fakeDb = (store = { rows: [], calls: [] }) => ({
    _store: store,
    from(table) {
      const q = { table, filters: {}, order: null, limitN: null };
      store.calls.push(q);
      return {
        insert: (r) => ({ select: async () => { store.rows.push({ table, ...r }); return { data: [{ id: 'x' }], error: null }; } }),
        select() { return this; },
        eq(col, val) { q.filters[col] = val; return this; },
        order(col, opts) { q.order = { col, ascending: opts && opts.ascending }; return this; },
        async limit(n) {
          q.limitN = n;
          const matched = store.rows
            .filter((r) => r.table === q.table)
            .filter((r) => q.filters.event_type === undefined || r.event_type === q.filters.event_type)
            .filter((r) => q.filters.entity_id === undefined || r.entity_id === q.filters.entity_id)
            // created_at is assigned per insert order; sort HONESTLY so ascending/descending differ.
            .map((r, i) => ({ metadata: r.metadata, created_at: `t${i}` }))
            .sort((a, b) => (q.order && q.order.ascending ? 1 : -1) * (a.created_at < b.created_at ? -1 : 1));
          return { data: matched.slice(0, n), error: null };
        },
      };
    },
  });

  it('a recorded decision reads back as the same decision, from the right table and filters', async () => {
    const store = { rows: [], calls: [] };
    const db = fakeDb(store);
    expect(await recordDemandDecision(db, withheld)).toBe(true);
    expect(store.rows[0].table).toBe('audit_log');
    expect(store.rows[0].event_type).toBe(DEMAND_GATE_EVENT);
    expect(store.rows[0].entity_id).toBe('refill-auto-promote');
    expect(await readLastDemandDecision(db, 'refill-auto-promote')).toEqual(withheld);

    const read = store.calls[store.calls.length - 1];
    expect(read.table).toBe('audit_log');
    expect(read.filters.event_type).toBe(DEMAND_GATE_EVENT);   // kills "drop .eq(event_type)"
    expect(read.filters.entity_id).toBe('refill-auto-promote'); // kills "drop .eq(entity_id)"
    expect(read.order).toEqual({ col: 'created_at', ascending: false }); // kills the sort flip
    expect(read.limitN).toBe(1);
  });

  it('THE SORT DIRECTION IS LOAD-BEARING — the LATEST verdict wins, not the first', async () => {
    // Two rows with different timestamps is the only shape that can tell the directions apart.
    // Ascending would freeze the badge on the first verdict ever recorded, for good.
    const db = fakeDb();
    await recordDemandDecision(db, sourced);   // older
    await recordDemandDecision(db, withheld);  // newer
    expect((await readLastDemandDecision(db, 'refill-auto-promote')).decision).toBe('withheld');
  });

  it('engines do not read each other\'s verdicts', async () => {
    // Without the entity_id filter a two-engine badge shows one engine's decision under the
    // other's name — a cross-engine mixup that looks like a working gate.
    const db = fakeDb();
    await recordDemandDecision(db, { ...sourced, engine: 'fr-c-generator' });
    expect(await readLastDemandDecision(db, 'refill-auto-promote')).toBeNull();
    expect((await readLastDemandDecision(db, 'fr-c-generator')).engine).toBe('fr-c-generator');
  });

  it('an insert that returns ZERO rows is reported as NOT recorded', async () => {
    // The silent-write trap: an RLS-rejected insert returns HTTP 200, error=null, and no rows.
    // Trusting `!error` alone would report a recorded decision that does not exist.
    const db = { from: () => ({ insert: () => ({ select: async () => ({ data: [], error: null }) }) }) };
    expect(await recordDemandDecision(db, withheld)).toBe(false);
  });

  it('a recording failure does NOT throw — observability never gates production', async () => {
    const db = { from: () => ({ insert: () => ({ select: async () => ({ data: null, error: { message: 'boom' } }) }) }) };
    expect(await recordDemandDecision(db, withheld)).toBe(false);
  });

  it('NOTHING recorded reads as null (NEVER RAN), a READ FAULT reads as unmeasurable', async () => {
    const empty = { from: () => ({ select: () => ({ eq: function () { return this; }, order: function () { return this; },
      limit: async () => ({ data: [], error: null }) }) }) };
    expect(await readLastDemandDecision(empty, 'e')).toBeNull();

    const broken = { from: () => ({ select: () => ({ eq: function () { return this; }, order: function () { return this; },
      limit: async () => ({ data: null, error: { message: 'relation missing' } }) }) }) };
    const d = await readLastDemandDecision(broken, 'e');
    expect(d.decision).toBe('unmeasurable');   // NOT null — we could not look, so we do not know
  });

  it('a row with an UNREADABLE payload is unmeasurable, not never-ran', async () => {
    const corrupt = { from: () => ({ select: () => ({ eq: function () { return this; }, order: function () { return this; },
      limit: async () => ({ data: [{ metadata: 'not-an-object', created_at: 't' }], error: null }) }) }) };
    const d = await readLastDemandDecision(corrupt, 'e');
    expect(d.decision).toBe('unmeasurable');
    expect(d.reason).toContain('unreadable');
  });
});
