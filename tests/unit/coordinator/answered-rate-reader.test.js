/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-2, acceptance half) — the first PRODUCTION READER
 * of the receipt ledger, plus the two defects wiring it exposed.
 *
 * The SD shipped three lanes WRITING receipts and nothing reading them, so the state was recorded
 * and unobservable — the write half of its own thesis. Coordinator ruled WIRE rather than defer,
 * partly because deferring would have made FR-4's unhold trigger (which needs the answered-rate to
 * be computable) permanently unreachable.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { answeredBySeat } = require_('../../../lib/coordination/answered-rate.cjs');
import { renderAnsweredRate } from '../../../scripts/coordinator-startup-check.mjs';

describe('answeredBySeat reads the callsign where it actually lives', () => {
  it('groups by payload.sender_callsign, not just a top-level field', () => {
    /**
     * The module's own docblock says "Grouped by payload.sender_callsign" and the code read
     * `s.sender_callsign`. Live rows carry it INSIDE payload — there is no top-level column of that
     * name ("column session_coordination.sender_callsign does not exist"). So a caller passing raw
     * DB rows bucketed EVERY seat as 'unknown', collapsing the breakdown to one row and making
     * "NO SEAT AT ZERO" unfalsifiable — while still returning a confident-looking number.
     *
     * It could not surface before now because the only caller was a test supplying the flat shape.
     */
    const signals = [
      { id: 'a', created_at: '2026-07-31T10:00:00Z', payload: { sender_callsign: 'Echo' } },
      { id: 'b', created_at: '2026-07-31T10:01:00Z', payload: { sender_callsign: 'Echo' } },
      { id: 'c', created_at: '2026-07-31T10:02:00Z', payload: { sender_callsign: 'Foxtrot' } },
    ];
    const receipts = [{ coordination_id: 'a', lane: 'signal', state: 'disposed', is_retention: false }];
    const { seats } = answeredBySeat({ signals, receipts });
    const byName = Object.fromEntries(seats.map((s) => [s.seat, s]));

    expect(Object.keys(byName).sort()).toEqual(['Echo', 'Foxtrot']);
    expect(byName.Echo).toMatchObject({ sent: 2, answered: 1 });
    expect(byName.Foxtrot).toMatchObject({ sent: 1, answered: 0 });

    // MUTATION: read only s.sender_callsign -> every seat collapses to 'unknown' and this fails.
    // That state produced a real number with a meaningless seat breakdown.
  });

  it('still honours a flat sender_callsign, so the pre-existing shape keeps working', () => {
    const { seats } = answeredBySeat({
      signals: [{ id: 'a', sender_callsign: 'Alpha-3' }],
      receipts: [],
    });
    expect(seats[0].seat).toBe('Alpha-3');
  });
});

describe('the reader pages past the 1000-row cap', () => {
  it('does not compute a rate over a truncated page', async () => {
    /**
     * *** THE FIRST CUT OF THIS READER PRINTED "1.3% (13 answered / 1000 signals)". ***
     * 1000 is not a measurement, it is PostgREST's default cap, returned WITHOUT error. The
     * denominator was a truncated page rendered as the population. Live truth once paged: 2015
     * signals, cross-checked against an independent head:true count of 2015.
     *
     * It was also FALSELY ACCUSING SEATS: two seats appeared "at zero with >=5 sent" under the cap
     * and dropped off once the full window was read. A silent truncation does not just understate a
     * total — it manufactures specific, nameable, wrong conclusions about individuals.
     */
    const PAGE = 1000;
    const TOTAL = 2015;
    const signals = Array.from({ length: TOTAL }, (_, i) => ({
      id: `s${i}`, created_at: '2026-07-31T10:00:00Z', payload: { sender_callsign: 'Echo' },
    }));

    // Fake client that enforces the real cap: it serves at most PAGE rows per .range() call.
    const paged = (rows) => ({
      select() { return this; }, not() { return this; }, eq() { return this; },
      gte() { return this; }, order() { return this; },
      range: async (from, to) => ({ data: rows.slice(from, Math.min(to + 1, from + PAGE)), error: null }),
    });
    const sb = {
      from(table) {
        return table === 'session_coordination' ? paged(signals) : paged([]);
      },
    };

    const out = await renderAnsweredRate(sb);
    expect(out).toContain(String(TOTAL));
    expect(out, 'a rate computed over the cap would report 1000').not.toContain('/ 1000 signals');

    // MUTATION: drop the fetchAll pagination loop -> only the first 1000 rows are read and this
    // fails on both assertions.
  });

  it('renders UNKNOWN rather than a healthy-looking 0% when nothing is measurable', async () => {
    // An absence displayed as 0% is the defect answered-rate.cjs exists to prevent: a window where
    // the writer was not deployed is indistinguishable, to a naive query, from a window where
    // nobody answered.
    const empty = {
      select() { return this; }, not() { return this; }, eq() { return this; },
      gte() { return this; }, order() { return this; },
      range: async () => ({ data: [], error: null }),
    };
    const out = await renderAnsweredRate({ from: () => empty });
    expect(out).toMatch(/UNKNOWN/);
    expect(out).not.toMatch(/\b0\.0%/);
  });

  it('is FAIL-OPEN — a broken query can never break coordinator startup', async () => {
    const boom = { from() { throw new Error('db down'); } };
    const out = await renderAnsweredRate(boom);
    expect(out).toContain('fail-open');
  });
});
