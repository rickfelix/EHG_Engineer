/**
 * QF-20260904-708: sd:next and worker self-claim ignored a parent's declared
 * metadata.mandatory_child_order (a repo-wide grep found zero readers on the selection path),
 * so a worker could pick a child ahead of a non-terminal predecessor and ship a dead guard.
 * parseMandatoryChildOrder() reads the structured form (primary) or a free-text fallback.
 * mandatoryChildOrderPending() is the shared gate (mirrors parentLeadPending's fail-open shape).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseMandatoryChildOrder, mandatoryChildOrderPending } = require('../../lib/fleet/claim-eligibility.cjs');

describe('parseMandatoryChildOrder', () => {
  it('returns null order when the field is absent', () => {
    expect(parseMandatoryChildOrder({})).toEqual({ order: null, reason: null, structured: false });
    expect(parseMandatoryChildOrder(null)).toEqual({ order: null, reason: null, structured: false });
  });

  it('reads the structured form as primary', () => {
    const meta = { mandatory_child_order: { order: ['e', 'a', 'b'], reason: 'criterion 3' } };
    expect(parseMandatoryChildOrder(meta)).toEqual({ order: ['E', 'A', 'B'], reason: 'criterion 3', structured: true });
  });

  it('parses the actual GATE-EVIDENCE-001 free-text field verbatim', () => {
    const meta = { mandatory_child_order: 'E -> A -> B(criterion 3). Derived independently by two sub-agents. Out-of-order dispatch ships a dead guard.' };
    const { order, structured } = parseMandatoryChildOrder(meta);
    expect(order).toEqual(['E', 'A', 'B']);
    expect(structured).toBe(false);
  });

  it('never over-reads into trailing prose past the first sentence', () => {
    const meta = { mandatory_child_order: 'A -> B. Then unrelated free text mentioning C and D somewhere later.' };
    expect(parseMandatoryChildOrder(meta).order).toEqual(['A', 'B']);
  });

  it('returns null for a single-token order (nothing to enforce)', () => {
    expect(parseMandatoryChildOrder({ mandatory_child_order: 'A' }).order).toBeNull();
  });
});

// Mock supabase for mandatoryChildOrderPending: first .from() call is the parent lookup
// (select/or/maybeSingle), second is the siblings list (select/eq -> {data}).
function mkSb({ parent, siblings }) {
  let call = 0;
  return {
    from() {
      call += 1;
      const isParentCall = call === 1;
      const q = {
        select() { return q; },
        or() { return q; },
        eq() { return isParentCall ? q : { limit: () => Promise.resolve({ data: siblings, error: null }) }; },
        maybeSingle() { return Promise.resolve({ data: parent, error: null }); },
      };
      return q;
    },
  };
}

describe('mandatoryChildOrderPending', () => {
  it('returns not-held for an SD with no parent', async () => {
    const sb = mkSb({ parent: null, siblings: [] });
    expect(await mandatoryChildOrderPending(sb, { parent_sd_id: null })).toEqual({ held: false, afterKey: null });
  });

  it('HELD: a child ranks below a non-terminal predecessor named in the order', async () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT-001', metadata: { mandatory_child_order: { order: ['E', 'A', 'B'] } } };
    const siblings = [
      { sd_key: 'SD-PARENT-001-E', status: 'in_progress' },
      { sd_key: 'SD-PARENT-001-A', status: 'draft' },
      { sd_key: 'SD-PARENT-001-B', status: 'draft' },
    ];
    const sb = mkSb({ parent, siblings });
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-PARENT-001-A', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: true, afterKey: 'SD-PARENT-001-E' });
  });

  it('NOT held: ranks normally once every predecessor is completed', async () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT-001', metadata: { mandatory_child_order: { order: ['E', 'A'] } } };
    const siblings = [
      { sd_key: 'SD-PARENT-001-E', status: 'completed' },
      { sd_key: 'SD-PARENT-001-A', status: 'draft' },
    ];
    const sb = mkSb({ parent, siblings });
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-PARENT-001-A', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: false, afterKey: null });
  });

  it('the FIRST item in the order is never held (nothing precedes it)', async () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT-001', metadata: { mandatory_child_order: { order: ['E', 'A'] } } };
    const siblings = [{ sd_key: 'SD-PARENT-001-E', status: 'draft' }, { sd_key: 'SD-PARENT-001-A', status: 'draft' }];
    const sb = mkSb({ parent, siblings });
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-PARENT-001-E', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: false, afterKey: null });
  });

  it('a child not named in the order is never held (fail-open, not applicable)', async () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT-001', metadata: { mandatory_child_order: { order: ['E', 'A'] } } };
    const siblings = [{ sd_key: 'SD-PARENT-001-E', status: 'draft' }, { sd_key: 'SD-PARENT-001-Z', status: 'draft' }];
    const sb = mkSb({ parent, siblings });
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-PARENT-001-Z', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: false, afterKey: null });
  });

  it('no declared order at all is never held', async () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT-001', metadata: {} };
    const sb = mkSb({ parent, siblings: [] });
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-PARENT-001-A', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: false, afterKey: null });
  });

  it('fail-open: a thrown lookup error never strands the child', async () => {
    const sb = { from() { throw new Error('boom'); } };
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-PARENT-001-A', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: false, afterKey: null });
  });

  it('reproduces the actual GATE-EVIDENCE-001 free-text fixture end-to-end', async () => {
    const parent = {
      id: 'p1', sd_key: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001',
      metadata: { mandatory_child_order: 'E -> A -> B(criterion 3). Derived independently by two sub-agents.' },
    };
    const siblings = [
      { sd_key: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E', status: 'draft' },
      { sd_key: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A', status: 'draft' },
      { sd_key: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B', status: 'draft' },
    ];
    const sb = mkSb({ parent, siblings });
    const r = await mandatoryChildOrderPending(sb, { sd_key: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A', parent_sd_id: 'p1' });
    expect(r).toEqual({ held: true, afterKey: 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E' });
  });
});
