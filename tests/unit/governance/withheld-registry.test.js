// SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001.
//
// The defect: a withheld promotable group existed durably nowhere — stdout in one GHA run plus an
// integer the caller discarded — while its source rows aged out of a 14-day window.
//
// THE FAILURE MODE OF A *RECORDING* FIX IS A FIX THAT RECORDS ON EVERY RUN. That looks identical
// to a working one from outside while meaning nothing, which is the same class as the defect. So
// the negative controls below were written BEFORE the write path and are the primary assertions;
// the positive case is the easy half.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { gatedQfMint } from '../../../lib/governance/qf-mint-gate.mjs';
import {
  buildMarker,
  deriveAdmissionPath,
  isPending,
  disposeMarker,
  consumeMarker,
  writeMarkers,
  MARKER_KEY,
  ADMISSION_SEVERITY_BYPASS,
  ADMISSION_COUNT_THRESHOLD,
} from '../../../lib/governance/withheld-registry.mjs';

const require_ = createRequire(import.meta.url);
const { severityRank, fingerprint } = require_('../../../lib/shared/content-fingerprint.cjs');

const NOW = '2026-08-03T22:00:00.000Z';
const group = (over = {}) => ({
  fingerprint: 'abc123',
  rows: [{ id: 'fb-1' }],
  max_severity: 'critical',
  groupKeys: new Set(['fb-1']),
  ...over,
});
const demand = (over = {}) => ({ engine: 'e', gauge_value: 151, floor: 3, decision: 'withheld', ...over });

describe('FR-8 — an ALLOWED run writes zero markers', () => {
  // Forced via opts.gauge, NOT opts.measure. A measure stub asserts "handed the word sourced, I
  // write nothing"; a gauge stub asserts "when the belt is genuinely below the floor, I write
  // nothing". Only the second is the requirement — the real decideDemand runs in between.
  it('writes nothing, and the zero carries positive controls so it can actually fail', async () => {
    const writes = [];
    const r = await gatedQfMint({}, {
      engine: 'test-engine',
      gauge: async () => 0,                     // real decideDemand: 0 <= floor 3 -> sourced
      record: async () => {},
      log: () => {},
      onWithheld: async () => { throw new Error('withhold branch must not run on an allowed run'); },
      writeMarkers: async (...a) => { writes.push(a); },
    }, async () => 7);

    // POSITIVE CONTROLS. writes.length === 0 alone is equally satisfied by a run that threw, a run
    // where mint never fired, or an arm that never executed. A zero that cannot distinguish "ran
    // and wrote nothing" from "never ran" is precisely the cannot-fail control this SD is about.
    expect(r.demand.decision).toBe('sourced');
    expect(r.minted).toBe(7);
    expect(r.withheldByDemand).toBe(false);
    expect(writes).toEqual([]);
  });

  it('the OTHER lever moves too — raising the floor above the gauge also allows', async () => {
    // A suite that only ever moves one operand is satisfied by an implementation that reads only
    // that operand. Both sides of the comparison get exercised.
    const writes = [];
    const r = await gatedQfMint({}, {
      engine: 'test-engine',
      env: { BELT_DEMAND_FLOOR: '999' },
      gauge: async () => 151,
      record: async () => {},
      log: () => {},
      writeMarkers: async (...a) => { writes.push(a); },
    }, async () => 2);
    expect(r.demand.decision).toBe('sourced');
    expect(r.minted).toBe(2);
    expect(writes).toEqual([]);
  });
});

describe('FR-8 — a WITHHELD run does write, so the negative above is not vacuous', () => {
  it('calls the writer exactly once with the groups', async () => {
    const writes = [];
    const r = await gatedQfMint({}, {
      engine: 'test-engine',
      gauge: async () => 151,
      record: async () => {},
      log: () => {},
      onWithheld: async () => [group(), group({ fingerprint: 'def456', rows: [{ id: 'fb-2' }] })],
      writeMarkers: async (sb, groups, d) => { writes.push({ groups, d }); },
    }, async () => 0);

    expect(r.withheldByDemand).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].groups).toHaveLength(2);
    expect(writes[0].d.decision).toBe('withheld');
  });

  it('does NOT call the writer when onWithheld returns a scalar — the out-of-scope engine writes nothing', async () => {
    // This is what keeps scripts/promote-retro-action-items.mjs correct with ZERO edits to it,
    // and turns "that engine writes no markers" from an inspection into an assertion.
    const writes = [];
    const r = await gatedQfMint({}, {
      engine: 'retro-engine',
      gauge: async () => 151,
      record: async () => {},
      log: () => {},
      onWithheld: async () => 34,
      writeMarkers: async (...a) => { writes.push(a); },
    }, async () => 0);
    expect(r.suppressed).toBe(34);
    expect(writes).toEqual([]);
  });
});

describe('FR-1 — the count comes from .length, never from Number()', () => {
  // MEASURED ON HEAD BEFORE THE FIX: an array return reported suppressed:0, because
  // Number([{},{}]) is NaN and NaN||0 is 0. That is the defect fixed in 43c488c62ca resurrected
  // by this very widening — a number that looks measured and looks like good news.
  it('reports the array length for an array return', async () => {
    const r = await gatedQfMint({}, {
      engine: 'e', gauge: async () => 151, record: async () => {}, log: () => {},
      onWithheld: async () => [group(), group(), group()],
    }, async () => 0);
    expect(r.suppressed).toBe(3);
  });

  it('still reports the number for a scalar return (backward compatible)', async () => {
    const r = await gatedQfMint({}, {
      engine: 'e', gauge: async () => 151, record: async () => {}, log: () => {},
      onWithheld: async () => 34,
    }, async () => 0);
    expect(r.suppressed).toBe(34);
  });

  it('a throwing onWithheld yields null, not a crash and not a false zero', async () => {
    const r = await gatedQfMint({}, {
      engine: 'e', gauge: async () => 151, record: async () => {}, log: () => {},
      onWithheld: async () => { throw new Error('boom'); },
    }, async () => 0);
    expect(r.suppressed).toBeNull();
    expect(r.withheldByDemand).toBe(true);
  });

  it('a failed durable write warns but does not convert a correct withhold into a crash', async () => {
    const logs = [];
    const r = await gatedQfMint({}, {
      engine: 'e', gauge: async () => 151, record: async () => {}, log: (m) => logs.push(m),
      onWithheld: async () => [group()],
      writeMarkers: async () => { throw new Error('db down'); },
    }, async () => 0);
    expect(r.withheldByDemand).toBe(true);
    expect(logs.join('\n')).toContain('durable withheld-record write failed');
  });
});

describe('FR-9 — the UNMEASURABLE arm is a third outcome, not a withhold in disguise', () => {
  it('takes the withhold branch but carries gauge_value null, never a coerced 0', async () => {
    const r = await gatedQfMint({}, {
      engine: 'e',
      gauge: async () => { throw new Error('gauge unavailable'); },
      record: async () => {}, log: () => {},
      onWithheld: async () => [group()],
    }, async () => 0);
    expect(r.withheldByDemand).toBe(true);
    expect(r.demand.decision).toBe('unmeasurable');
    // A null that becomes 0 is indistinguishable from a real below-floor reading.
    expect(r.demand.gauge_value).toBeNull();
  });

  it('buildMarker preserves that null rather than defaulting it', () => {
    const m = buildMarker(group(), demand({ gauge_value: null, decision: 'unmeasurable' }), {
      nowIso: NOW, severityRank, threshold: 3,
    });
    expect(m.gauge_value).toBeNull();
    expect(m.decision).toBe('unmeasurable');
  });
});

describe('admission_path — falsifiable, not decorative', () => {
  it('a critical singleton reports severity_bypass', () => {
    expect(deriveAdmissionPath(group(), severityRank, 3)).toBe(ADMISSION_SEVERITY_BYPASS);
  });

  it('a non-critical group over the key threshold reports count_threshold', () => {
    const g = group({ max_severity: 'high', groupKeys: new Set(['a', 'b', 'c']) });
    expect(deriveAdmissionPath(g, severityRank, 3)).toBe(ADMISSION_COUNT_THRESHOLD);
  });

  // THE DISCRIMINATOR. A group that satisfies BOTH must report the branch shouldPromote actually
  // took — severity returns first. Without this case the field is unfalsifiable.
  it('a group that is BOTH critical AND over the threshold reports severity_bypass', () => {
    const g = group({ max_severity: 'critical', groupKeys: new Set(['a', 'b', 'c', 'd']) });
    expect(deriveAdmissionPath(g, severityRank, 3)).toBe(ADMISSION_SEVERITY_BYPASS);
  });
});

describe('FR-3 — registry semantics: one mutable marker, run provenance as counters', () => {
  it('a first observation starts the counters', () => {
    const m = buildMarker(group(), demand(), { nowIso: NOW, runId: 'run-1', severityRank, threshold: 3 });
    expect(m.withheld_run_count).toBe(1);
    expect(m.first_withheld_at).toBe(NOW);
    expect(m.first_withheld_run).toBe('run-1');
  });

  it('a repeat run advances last_* and the count while first_* does NOT move', () => {
    const first = buildMarker(group(), demand(), { nowIso: NOW, runId: 'run-1', severityRank, threshold: 3 });
    const later = '2026-08-04T04:00:00.000Z';
    const second = buildMarker(group(), demand(), { nowIso: later, runId: 'run-2', severityRank, threshold: 3, prior: first });
    expect(second.withheld_run_count).toBe(2);
    expect(second.first_withheld_at).toBe(NOW);      // unmoved — this is the registry property
    expect(second.last_withheld_at).toBe(later);
    expect(second.first_withheld_run).toBe('run-1');
    expect(second.last_withheld_run).toBe('run-2');
  });

  it('four consecutive runs produce ONE marker with count 4, not four records', () => {
    let m = null;
    for (let i = 1; i <= 4; i++) {
      m = buildMarker(group(), demand(), { nowIso: NOW, runId: `run-${i}`, severityRank, threshold: 3, prior: m });
    }
    expect(m.withheld_run_count).toBe(4);
    expect(m.first_withheld_run).toBe('run-1');
  });

  it('the fingerprint MOVES when a title is edited — the precondition that makes the key choice matter', () => {
    // Asserted rather than assumed: normalize() truncates at 200 chars and strips trailing
    // punctuation and collapses whitespace, so a naive edit leaves the fingerprint unchanged and
    // a test built on it would pass while proving nothing. This uses an interior word change.
    const before = fingerprint('harness_backlog', 'the promoter drops withheld groups\nbody');
    const after = fingerprint('harness_backlog', 'the promoter discards withheld groups\nbody');
    expect(after).not.toBe(before);

    // The marker follows the row id, so a moved fingerprint updates the same record rather than
    // orphaning it. member_feedback_ids is the identity; fingerprint is carried, not keyed on.
    const m1 = buildMarker(group({ fingerprint: before }), demand(), { nowIso: NOW, severityRank, threshold: 3 });
    const m2 = buildMarker(group({ fingerprint: after }), demand(), { nowIso: NOW, severityRank, threshold: 3, prior: m1 });
    expect(m2.member_feedback_ids).toEqual(['fb-1']);
    expect(m2.fingerprint).toBe(after);
    expect(m2.withheld_run_count).toBe(2);
  });

  it('a group that GROWS updates the member list rather than forking a record', () => {
    const m1 = buildMarker(group(), demand(), { nowIso: NOW, severityRank, threshold: 3 });
    const grown = group({ rows: [{ id: 'fb-1' }, { id: 'fb-2' }] });
    const m2 = buildMarker(grown, demand(), { nowIso: NOW, severityRank, threshold: 3, prior: m1 });
    expect(m2.member_feedback_ids).toEqual(['fb-1', 'fb-2']);
    expect(m2.withheld_run_count).toBe(2);
  });
});

describe('FR-5 — exit only by a named, recorded event', () => {
  it('a fresh marker is pending', () => {
    expect(isPending(buildMarker(group(), demand(), { nowIso: NOW, severityRank, threshold: 3 }))).toBe(true);
  });

  it('a promoted marker is no longer pending', () => {
    const m = buildMarker(group(), demand(), { nowIso: NOW, severityRank, threshold: 3 });
    expect(isPending({ ...m, promoted_qf_id: 'QF-1' })).toBe(false);
  });

  it('a dispositioned marker is no longer pending', () => {
    const m = buildMarker(group(), demand(), { nowIso: NOW, severityRank, threshold: 3 });
    expect(isPending({ ...m, disposed_at: NOW, disposed_by: 'x', disposed_reason: 'y' })).toBe(false);
  });

  it('consumeMarker REFUSES without a minted id — a consumption with no id is a silent exit', async () => {
    await expect(consumeMarker({}, 'fb-1', null)).rejects.toThrow(/minted QF id is required/);
  });

  it('disposeMarker REFUSES without BOTH an actor and a reason', async () => {
    await expect(disposeMarker({}, 'fb-1', { actor: 'me' })).rejects.toThrow(/actor and reason/);
    await expect(disposeMarker({}, 'fb-1', { reason: 'stale' })).rejects.toThrow(/actor and reason/);
  });

  it('buildMarker refuses to invent a clock', () => {
    expect(() => buildMarker(group(), demand(), { severityRank, threshold: 3 })).toThrow(/nowIso is required/);
  });
});

describe('writeMarkers — the real function, not an injected stub', () => {
  // Found at review: every writeMarkers reference in the first version of this suite was a STUB.
  // The read-modify-write loop, the non-resurrection guard and the metadata carry-through had
  // never executed under test, so the mechanism that actually implements idempotency was unpinned.
  const fakeDb = (rows, { failWrites = false, failReads = false } = {}) => {
    const store = new Map(rows.map((r) => [r.id, r]));
    return {
      updates: [],
      from() { return this; },
      select() { return this; },
      eq(_c, v) { this._id = v; return this; },
      maybeSingle() {
        if (failReads) return Promise.resolve({ data: null, error: { message: 'read denied' } });
        return Promise.resolve({ data: store.get(this._id) ?? null, error: null });
      },
      update(patch) {
        if (failWrites) return { eq: () => Promise.resolve({ error: { message: 'write denied' } }) };
        return {
          eq: (_c, id) => {
            store.set(id, { ...store.get(id), ...patch });
            this.updates.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        };
      },
      _store: store,
    };
  };
  const ctx = { nowIso: NOW, runId: 'run-1', severityRank, threshold: 3 };

  it('writes one marker per member row and carries existing metadata through', async () => {
    const db = fakeDb([{ id: 'fb-1', metadata: { keep: 'me' } }]);
    const res = await writeMarkers(db, [group()], demand(), ctx);
    expect(res.written).toBe(1);
    expect(db._store.get('fb-1').metadata.keep).toBe('me');
    expect(db._store.get('fb-1').metadata[MARKER_KEY].withheld_run_count).toBe(1);
  });

  it('is idempotent across runs — the SAME row, counters advancing', async () => {
    const db = fakeDb([{ id: 'fb-1', metadata: {} }]);
    await writeMarkers(db, [group()], demand(), ctx);
    await writeMarkers(db, [group()], demand(), { ...ctx, runId: 'run-2' });
    const m = db._store.get('fb-1').metadata[MARKER_KEY];
    expect(m.withheld_run_count).toBe(2);
    expect(m.first_withheld_run).toBe('run-1');
    expect(m.last_withheld_run).toBe('run-2');
  });

  it('does NOT resurrect a marker that already left pending state', async () => {
    const consumedMarker = { ...buildMarker(group(), demand(), ctx), promoted_qf_id: 'QF-9' };
    const db = fakeDb([{ id: 'fb-1', metadata: { [MARKER_KEY]: consumedMarker } }]);
    const res = await writeMarkers(db, [group()], demand(), ctx);
    expect(res.written).toBe(0);
    expect(db._store.get('fb-1').metadata[MARKER_KEY].promoted_qf_id).toBe('QF-9');
  });

  // THE FALSE-ZERO. The first version returned {written: 0} when every write was rejected, and the
  // caller then announced "these now survive their 14-day window" — a claim of protection that had
  // not happened, with nothing raised to contradict it. That is this module's own defect class,
  // reproduced inside the fix for it.
  it('THROWS when every write fails, rather than reporting a silent zero', async () => {
    const db = fakeDb([{ id: 'fb-1', metadata: {} }], { failWrites: true });
    await expect(writeMarkers(db, [group()], demand(), ctx)).rejects.toThrow(/all 1 durable write\(s\) failed/);
  });

  it('reports a PARTIAL failure instead of throwing, so a partial record is kept', async () => {
    const db = fakeDb([{ id: 'fb-1', metadata: {} }, { id: 'fb-2', metadata: {} }]);
    let n = 0;
    const origUpdate = db.update.bind(db);
    db.update = (patch) => (++n === 2
      ? { eq: () => Promise.resolve({ error: { message: 'write denied' } }) }
      : origUpdate(patch));
    const res = await writeMarkers(db, [group({ rows: [{ id: 'fb-1' }, { id: 'fb-2' }] })], demand(), ctx);
    expect(res.written).toBe(1);
    expect(res.failed).toHaveLength(1);
  });

  it('an empty group list writes nothing and does not throw', async () => {
    const db = fakeDb([]);
    await expect(writeMarkers(db, [], demand(), ctx)).resolves.toEqual({ written: 0, rows: [] });
  });

  it('refuses a client that is not a client, rather than failing later and vaguely', async () => {
    await expect(writeMarkers(null, [group()], demand(), ctx)).rejects.toThrow(/supabase client is required/);
  });
});

describe('the marker survives a full-object metadata spread (FR-5 live hazard)', () => {
  it('is preserved when unrelated metadata is rewritten around it', () => {
    // The promoter's success path rewrites metadata as a spread from an earlier snapshot. The
    // marker must be carried through, not clobbered. This pins the shape that makes that possible.
    const marker = buildMarker(group(), demand(), { nowIso: NOW, severityRank, threshold: 3 });
    const existing = { [MARKER_KEY]: marker, unrelated: 'keep me' };
    const rewritten = { ...existing, promoted_to_qf: true };
    expect(rewritten[MARKER_KEY]).toEqual(marker);
    expect(rewritten.unrelated).toBe('keep me');
  });
});
