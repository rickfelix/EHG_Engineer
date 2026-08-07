// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — TS-3 (within-tick), TS-4 (cross-tick supersede),
// TS-5 (the per-target-cap collapse that reads as a bound and acts as a silencer).
import { describe, it, expect } from 'vitest';
import { aggregateLane, MAX_DIGESTS_PER_TICK } from '../../../lib/escalation/aggregate.js';

/** Recording io seam. Counts real emissions so a "cap" cannot hide behind a return value. */
function io({ pending = null } = {}) {
  const calls = { inserts: [], updates: [], finds: 0 };
  return {
    calls,
    findPending: async () => { calls.finds += 1; return pending; },
    insert: async (d) => { calls.inserts.push(d); return { id: 'digest-1', ...d }; },
    update: async (id, patch) => { calls.updates.push({ id, ...patch }); return { id, ...patch }; },
  };
}

describe('TS-3 — WITHIN a tick, N stalls collapse to ONE digest', () => {
  it('5 stalls in one tick emit exactly 1 insert', async () => {
    const t = io();
    const res = await aggregateLane([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }], t, 'owner');
    expect(t.calls.inserts).toHaveLength(MAX_DIGESTS_PER_TICK);
    expect(res.action).toBe('inserted');
  });

  it('the digest CARRIES the count — collapsing rows must not collapse the scale', async () => {
    // A cap that also truncated the reported count would be the silencer wearing the bound's
    // clothes: one row saying "1 item" when 5 are stalled reads as a quiet system.
    const t = io();
    const res = await aggregateLane([{ id: 'a' }, { id: 'b' }, { id: 'c' }], t, 'owner');
    expect(res.count).toBe(3);
    expect(t.calls.inserts[0].count).toBe(3);
    expect(t.calls.inserts[0].item_ids).toEqual(['a', 'b', 'c']);
  });

  it('an empty tick emits nothing at all', async () => {
    const t = io();
    const res = await aggregateLane([], t, 'owner');
    expect(res.action).toBe('none');
    expect(t.calls.inserts).toHaveLength(0);
    expect(t.calls.finds).toBe(0); // does not even probe — no work, no reads
  });
});

describe('TS-4 — ACROSS ticks, a pending digest is SUPERSEDED, never re-inserted', () => {
  it('with a pending digest, it updates in place and inserts nothing', async () => {
    const t = io({ pending: { id: 'existing-digest' } });
    const res = await aggregateLane([{ id: 'a' }, { id: 'b' }], t, 'chairman_packet');
    expect(t.calls.inserts).toHaveLength(0);
    expect(t.calls.updates).toHaveLength(1);
    expect(t.calls.updates[0].id).toBe('existing-digest');
    expect(res.action).toBe('superseded');
  });

  it('THE 5-TICK CASE — an unmoved item emits ~1 row total, not one per tick', async () => {
    // The PRD's smoke step 4, as a unit test. Without the supersede half this is 5 inserts:
    // capped within each tick, unbounded across them. Because the ladder repeats, "still
    // unmoved" is the normal case, so the omission floods continuously rather than rarely.
    let pending = null;
    const inserts = [];
    const updates = [];
    const seam = {
      findPending: async () => pending,
      insert: async (d) => { inserts.push(d); pending = { id: 'digest-1' }; return pending; },
      update: async (id, patch) => { updates.push({ id, ...patch }); return { id }; },
    };
    for (let tick = 0; tick < 5; tick++) {
      await aggregateLane([{ id: 'stuck-item' }], seam, 'chairman_packet');
    }
    expect(inserts).toHaveLength(1);   // one row ever created
    expect(updates).toHaveLength(4);   // refreshed on each subsequent tick
  });

  it('the supersede refreshes count and ids so the digest does not go stale', async () => {
    const t = io({ pending: { id: 'existing-digest' } });
    await aggregateLane([{ id: 'a' }, { id: 'b' }, { id: 'c' }], t, 'owner');
    expect(t.calls.updates[0].count).toBe(3);
    expect(t.calls.updates[0].item_ids).toEqual(['a', 'b', 'c']);
  });
});

describe('TS-5 — the PER-TARGET CAP COLLAPSE: a bound and a silencer look identical at N=1', () => {
  it('N items sharing ONE target still report N, and still emit exactly one row', async () => {
    // THE DISCRIMINATING FIXTURE. Every one of these escalates to the SAME target (the
    // chairman), which is the shape the x5 rung always has. A per-TARGET cap of 1 would emit
    // one row here and look correct — the giveaway is the COUNT. A silencer reports 1; a bound
    // reports 7 and sends once. Asserting only "one row emitted" cannot tell them apart, which
    // is precisely why the inbound-backlog-watchdog refused to copy MAX_PROBES_PER_TICK.
    const t = io();
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `item-${i}`, target: 'chairman' }));
    const res = await aggregateLane(seven, t, 'chairman_packet');

    expect(t.calls.inserts).toHaveLength(1); // bounded
    expect(res.count).toBe(7);               // NOT collapsed to 1 — this is the discriminator
    expect(t.calls.inserts[0].count).toBe(7);
    expect(t.calls.inserts[0].item_ids).toHaveLength(7);
  });

  it('the cap constant is named for what it bounds', async () => {
    // Cheap, and it pins the property the name carries: a bare MAX_ESCALATIONS can be silently
    // reinterpreted as per-recipient by the next reader. MAX_DIGESTS_PER_TICK cannot.
    expect(MAX_DIGESTS_PER_TICK).toBe(1);
  });
});

describe('io contract — refuses to guess a write path', () => {
  for (const missing of ['findPending', 'insert', 'update']) {
    it(`throws when io.${missing} is absent`, async () => {
      const t = io();
      delete t[missing];
      await expect(aggregateLane([{ id: 'a' }], t, 'owner')).rejects.toThrow(TypeError);
    });
  }
});
