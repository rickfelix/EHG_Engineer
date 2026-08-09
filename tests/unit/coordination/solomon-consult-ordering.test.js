/**
 * One kind carrying two intents — SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-5.
 *
 * THE DEFECT. Adam's quiet tick emits a pre-send CC as kind='solomon_consult', the SAME kind as a
 * genuine question needing deep reasoning. Nothing in the row let the drain tell them apart: the
 * lane label is computed from `kind` alone, and ordering falls back to created_at ASC. So on a
 * busy day a real consult queues behind context CCs that need no answer, and Solomon works the
 * queue in arrival order with no way to know which is which.
 *
 * This is the canonical framing for the whole SD, in Solomon's own wording: ONE KIND CARRYING TWO
 * INTENTS with nothing in the row letting the drain discriminate. Fix the discrimination, not the
 * per-consumer workaround.
 *
 * WHAT MAKES THIS SMALLER THAN IT LOOKS. The discriminator ALREADY EXISTS — payload.consult_purpose
 * (scripts/worker-signal.cjs:464-469), added precisely so a pre-send CC would be machine-readable
 * rather than detectable only by a '[PRE-SEND CONSULT]' body prefix. It was optional, the producer
 * never set it, and the consumer never read it. So a field built for exactly this sat inert on both
 * ends. No new field, no schema change.
 *
 * WHAT WOULD STILL BE BROKEN IF A NAIVE TEST PASSED: a test asserting only "consults come first"
 * would pass on an input where the consult ALREADY came first by arrival time — i.e. vacuously.
 * The fixture below deliberately makes the CC OLDER, so arrival order and intent order disagree,
 * and it carries a control proving the old created_at-only ordering fails.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// solomon-advisory is CJS; vitest itself must be imported as ESM.
const { orderSolomonInboxRows } = createRequire(import.meta.url)('../../../scripts/solomon-advisory.cjs');

const row = (id, { purpose, minsAgo, kind = 'solomon_consult' } = {}) => ({
  id,
  created_at: new Date(Date.parse('2026-08-07T12:00:00Z') - minsAgo * 60_000).toISOString(),
  payload: { kind, ...(purpose ? { consult_purpose: purpose } : {}) }
});

describe('orderSolomonInboxRows — genuine consults precede pre-send CCs', () => {
  it('THE POINT: a genuine consult outranks an OLDER pre-send CC', () => {
    // The CC arrived first. Under created_at ASC it wins, and the real question waits behind it.
    const rows = [row('cc', { purpose: 'pre_send', minsAgo: 90 }), row('genuine', { minsAgo: 5 })];
    expect(orderSolomonInboxRows(rows).map((r) => r.id)).toEqual(['genuine', 'cc']);
  });

  it('CONTROL: created_at-only ordering puts the CC first — the behaviour being replaced', () => {
    // Without this arm the test above could pass for the wrong reason and nobody would notice.
    const rows = [row('cc', { purpose: 'pre_send', minsAgo: 90 }), row('genuine', { minsAgo: 5 })];
    const legacy = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    expect(legacy.map((r) => r.id)).toEqual(['cc', 'genuine']);
  });

  it('preserves created_at ASC WITHIN each class — oldest genuine consult still first', () => {
    const rows = [
      row('genuine-new', { minsAgo: 5 }),
      row('cc-old', { purpose: 'pre_send', minsAgo: 200 }),
      row('genuine-old', { minsAgo: 60 }),
      row('cc-new', { purpose: 'pre_send', minsAgo: 10 })
    ];
    expect(orderSolomonInboxRows(rows).map((r) => r.id))
      .toEqual(['genuine-old', 'genuine-new', 'cc-old', 'cc-new']);
  });

  it('treats a consult with NO consult_purpose as genuine, not as a CC', () => {
    // The field is optional and most existing callers omit it. Defaulting the other way would
    // demote every legacy consult ever sent — a silent regression across the whole lane.
    const rows = [row('cc', { purpose: 'pre_send', minsAgo: 90 }), row('legacy', { minsAgo: 30 })];
    expect(orderSolomonInboxRows(rows)[0].id).toBe('legacy');
  });

  it('does not reorder non-consult kinds relative to each other', () => {
    const rows = [
      row('directive-old', { kind: 'chairman_directive', minsAgo: 50 }),
      row('directive-new', { kind: 'chairman_directive', minsAgo: 5 })
    ];
    expect(orderSolomonInboxRows(rows).map((r) => r.id)).toEqual(['directive-old', 'directive-new']);
  });

  it('is a pure function — does not mutate its input', () => {
    const rows = [row('cc', { purpose: 'pre_send', minsAgo: 90 }), row('genuine', { minsAgo: 5 })];
    const before = rows.map((r) => r.id);
    orderSolomonInboxRows(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('tolerates missing payload / malformed rows without throwing', () => {
    const rows = [{ id: 'bare', created_at: new Date().toISOString() }, row('cc', { purpose: 'pre_send', minsAgo: 90 })];
    expect(() => orderSolomonInboxRows(rows)).not.toThrow();
    expect(orderSolomonInboxRows(rows)).toHaveLength(2);
  });
});
