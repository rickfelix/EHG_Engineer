/**
 * SD-LEO-INFRA-UNIFY-BELT-REFILL-001 (FR-2 / TS-5) — chairman-accept -> build-eligible stamp writer.
 *
 * Pins: stamps 'selected', is idempotent, skips a null source_wave_item_id, never clobbers a terminal
 * ('promoted'/'dropped') disposition, and is fail-soft (a DB error / throw never aborts the accept).
 */
import { describe, it, expect } from 'vitest';
import { stampAcceptedWaveItem } from '../../../lib/eva/consultant/stamp-accepted-wave-item.js';

// In-memory roadmap_wave_items mock that faithfully applies the writer's chain:
//   .update(patch).eq('id', v).not('item_disposition','in','("promoted","dropped")').select(...)
function makeSb(rows) {
  return {
    from() {
      let patch = null;
      const eqs = [];
      const nots = [];
      const builder = {
        update(p) { patch = p; return builder; },
        eq(col, val) { eqs.push({ col, val }); return builder; },
        not(col, op, val) { nots.push({ col, op, val }); return builder; },
        select() {
          let hits = rows.filter((r) => eqs.every((f) => r[f.col] === f.val));
          hits = hits.filter((r) => nots.every((nf) => {
            if (nf.op !== 'in') return true;
            const vals = nf.val.replace(/[()"]/g, '').split(',');
            return !vals.includes(String(r[nf.col]));
          }));
          if (patch) for (const r of hits) Object.assign(r, patch);
          return Promise.resolve({ data: hits.map((r) => ({ id: r.id, item_disposition: r.item_disposition })), error: null });
        },
      };
      return builder;
    },
  };
}

describe('stampAcceptedWaveItem', () => {
  it("stamps item_disposition='selected' on a pending row", async () => {
    const rows = [{ id: 'w1', item_disposition: 'pending' }];
    const out = await stampAcceptedWaveItem(makeSb(rows), 'w1');
    expect(out).toEqual({ stamped: true, reason: 'stamped' });
    expect(rows[0].item_disposition).toBe('selected');
  });

  it('advances a brainstormed row to selected', async () => {
    const rows = [{ id: 'w1', item_disposition: 'brainstormed' }];
    await stampAcceptedWaveItem(makeSb(rows), 'w1');
    expect(rows[0].item_disposition).toBe('selected');
  });

  it('is idempotent: re-stamping an already-selected row leaves it selected', async () => {
    const rows = [{ id: 'w1', item_disposition: 'selected' }];
    const first = await stampAcceptedWaveItem(makeSb(rows), 'w1');
    const second = await stampAcceptedWaveItem(makeSb(rows), 'w1');
    expect(first.stamped).toBe(true);
    expect(second.stamped).toBe(true);
    expect(rows[0].item_disposition).toBe('selected');
  });

  it('null / undefined source_wave_item_id is a clean no-op (no DB touch, no throw)', async () => {
    const sb = { from() { throw new Error('DB must not be touched for a null source_wave_item_id'); } };
    expect(await stampAcceptedWaveItem(sb, null)).toEqual({ stamped: false, reason: 'no_source_wave_item' });
    expect(await stampAcceptedWaveItem(sb, undefined)).toEqual({ stamped: false, reason: 'no_source_wave_item' });
  });

  it("never clobbers a terminal 'promoted' disposition", async () => {
    const rows = [{ id: 'w1', item_disposition: 'promoted' }];
    const out = await stampAcceptedWaveItem(makeSb(rows), 'w1');
    expect(out).toEqual({ stamped: false, reason: 'skipped_terminal' });
    expect(rows[0].item_disposition).toBe('promoted');
  });

  it("never clobbers a terminal 'dropped' disposition", async () => {
    const rows = [{ id: 'w1', item_disposition: 'dropped' }];
    const out = await stampAcceptedWaveItem(makeSb(rows), 'w1');
    expect(out).toEqual({ stamped: false, reason: 'skipped_terminal' });
    expect(rows[0].item_disposition).toBe('dropped');
  });

  it('fail-soft on a DB error (returns error, does not throw)', async () => {
    const sb = { from: () => ({ update: () => ({ eq: () => ({ not: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }) };
    const out = await stampAcceptedWaveItem(sb, 'w1');
    expect(out.stamped).toBe(false);
    expect(out.reason).toBe('error');
    expect(out.error).toBe('boom');
  });

  it('fail-soft on a thrown client error (caught, returns error)', async () => {
    const sb = { from() { throw new Error('client exploded'); } };
    const out = await stampAcceptedWaveItem(sb, 'w1');
    expect(out.stamped).toBe(false);
    expect(out.reason).toBe('error');
    expect(out.error).toBe('client exploded');
  });
});
