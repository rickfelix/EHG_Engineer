/**
 * QF-20260727-962 — claim burn, split by WHO burned it.
 *
 * THE WHOLE POINT IS THE DISCRIMINATION. A claim_history-length gauge scores "one seat retaking one
 * item thirteen times" identically to "thirteen workers bouncing off a dependency wall". Those are
 * different defects with opposite fixes, so every assertion here is paired against its twin: same
 * event count, different holder shape, different verdict.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const {
  classifyClaimBurn, planClaimBurnGauge, formatClaimBurnSummary, DEFAULT_MIN_EVENTS,
} = createRequire(import.meta.url)('../../../lib/coordinator/claim-burn-gauge.cjs');

const ev = (id) => ({ claimed_at: '2026-07-25T19:17:09.241Z', session_id: id, identity_source: 'env' });
const repeat = (n, id = 'sess-a') => Array.from({ length: n }, () => ev(id));
const distinct = (n) => Array.from({ length: n }, (_, i) => ev(`sess-${i}`));

describe('the two burn shapes are never collapsed', () => {
  it('THE LIVE SPECIMEN — 13 events under ONE holder is repeat_holder, not a wall', () => {
    // SD-LEO-INFRA-WORKER-INBOX-DRAIN-SUBSET-001 carries exactly this shape on the live table.
    const r = classifyClaimBurn(repeat(13));
    expect(r).toMatchObject({ events: 13, distinctHolders: 1, repeatEvents: 12, shape: 'repeat_holder' });
  });

  it('THE DISCRIMINATOR — the SAME event count with 13 distinct holders reports the other shape', () => {
    // Identical length, opposite diagnosis. A length-only gauge cannot tell these apart, and this
    // pair is what proves the split is real rather than decorative.
    const wall = classifyClaimBurn(distinct(13));
    const idem = classifyClaimBurn(repeat(13));
    expect(wall).toMatchObject({ events: 13, distinctHolders: 13, repeatEvents: 0, shape: 'distinct_holders' });
    expect(wall.events).toBe(idem.events);
    expect(wall.shape).not.toBe(idem.shape);
  });

  it('a mix of both is named mixed rather than forced into one bucket', () => {
    const r = classifyClaimBurn([...distinct(3), ev('sess-0'), ev('sess-0')]);
    expect(r).toMatchObject({ events: 5, distinctHolders: 3, repeatEvents: 2, shape: 'mixed' });
  });

  it('degenerate input never reports negative burn and never throws', () => {
    for (const bad of [null, undefined, 'x', [null, 3, {}], [{}, { session_id: '' }]]) {
      const r = classifyClaimBurn(bad);
      expect(r.repeatEvents).toBeGreaterThanOrEqual(0);
      expect(r.distinctHolders).toBeGreaterThanOrEqual(0);
    }
    // Unattributable entries count as events but must not inflate the holder count.
    expect(classifyClaimBurn([{}, {}])).toMatchObject({ events: 2, distinctHolders: 0, repeatEvents: 2 });
  });
});

describe('SUSTAINED burn only — a single re-claim is ordinary life', () => {
  it('one claim is not burn', () => {
    expect(classifyClaimBurn(repeat(1)).shape).toBe('none');
  });

  it('NEGATIVE CONTROL — 840 of 1254 live SDs have exactly one claim, so the floor must exclude them', () => {
    // Without a floor this gauge fires on the majority of the corpus and gets muted within a week,
    // which is the failure mode the sibling gauges document.
    expect(DEFAULT_MIN_EVENTS).toBeGreaterThan(2);
    const twoClaims = classifyClaimBurn(repeat(2));
    expect(twoClaims.shape).toBe('repeat_holder');       // classified…
    expect(twoClaims.events).toBeLessThan(DEFAULT_MIN_EVENTS); // …but below the reporting floor
  });
});

function fakeSb(rows) {
  const builder = {
    select: () => builder,
    order: () => builder,
    range: () => Promise.resolve({ data: rows, error: null }),
    then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  };
  return { from: () => builder };
}
const sd = (key, status, history) => ({ sd_key: key, status, metadata: { claim_history: history } });

describe('the gauge separates the signals and always declares its window', () => {
  it('emits repeat and distinct as SEPARATE buckets, never one total', async () => {
    const g = await planClaimBurnGauge(fakeSb([
      sd('SD-IDEM-001', 'completed', repeat(13)),
      sd('SD-WALL-001', 'in_progress', distinct(4)),
      sd('SD-MIXED-001', 'completed', [...distinct(3), ev('sess-0')]),
      sd('SD-QUIET-001', 'completed', repeat(1)),
    ]), { minEvents: 3 });

    expect(g.repeatHolder.map((r) => r.sd_key)).toEqual(['SD-IDEM-001']);
    expect(g.distinctHolders.map((r) => r.sd_key)).toEqual(['SD-WALL-001']);
    expect(g.mixed.map((r) => r.sd_key)).toEqual(['SD-MIXED-001']);
    expect(g.population).toBe(4);
    // The single-claim SD is counted in the totals but never reported as burn.
    expect(g.totalEvents).toBe(13 + 4 + 4 + 1);
  });

  it('THE WINDOW RIDES ON THE SIGNAL — a bare ratio is unreproducible', async () => {
    // The commissioning row quoted 3.30 events/completion; table-wide lifetime measures 0.50, and
    // both are correct for their scope. A figure without its denominator cannot be falsified.
    const g = await planClaimBurnGauge(fakeSb([sd('SD-A', 'completed', repeat(4))]), { minEvents: 3, windowLabel: '7d cohort' });
    expect(g.windowLabel).toBe('7d cohort');
    expect(g.eventsPerCompletion).toBe(4);
    const line = formatClaimBurnSummary(g);
    expect(line).toContain('7d cohort');
    expect(line).toMatch(/4 events \/ 1 completed = 4\.00 per completion/);
  });

  it('counts print unconditionally, zeros included', async () => {
    const g = await planClaimBurnGauge(fakeSb([sd('SD-A', 'completed', repeat(1))]), { minEvents: 3 });
    const line = formatClaimBurnSummary(g);
    expect(line).toContain('repeat_holder=0');
    expect(line).toContain('distinct_holders=0');
    expect(line).toContain('mixed=0');
  });

  it('no completions yields n/a rather than a fabricated ratio', async () => {
    const g = await planClaimBurnGauge(fakeSb([sd('SD-A', 'in_progress', repeat(5))]), { minEvents: 3 });
    expect(g.eventsPerCompletion).toBeNull();
    expect(formatClaimBurnSummary(g)).toContain('= n/a per completion');
  });

  it('fails OPEN on a query fault — an empty gauge, never a thrown dashboard tick', async () => {
    const broken = { from: () => { throw new Error('db down'); } };
    const g = await planClaimBurnGauge(broken, { minEvents: 3 });
    expect(g.population).toBe(0);
    expect(g.repeatHolder).toEqual([]);
    expect(formatClaimBurnSummary(g)).toContain('repeat_holder=0');
  });
});
