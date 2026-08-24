/**
 * Per-lane dead-letter rate gauge — SD-LEO-INFRA-COMMS-LANE-TTLS-001 FR-4/FR-5.
 * No live DB calls — supabase is a stubbed paginating client throughout.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DENOMINATOR_EXTENT,
  BASELINE_EVENT_TYPE,
  DISPROVEN_ORIGINAL_BASELINE,
  summarizeLaneDeadLetterRates,
  fetchAllLiveCoordinationRows,
  computeLaneDeadLetterGauge,
  buildBaselineRecord,
  recordDeadLetterBaseline,
} = require('../../../lib/coordination/lane-dead-letter-gauge.cjs');
const { LANES } = require('../../../lib/coordination/lane-contract.cjs');

const NOW = Date.parse('2026-08-23T12:00:00.000Z');
const HOUR = 3600 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();

const row = (kind, ageMs, readAgeMs = null) => ({
  payload: { kind },
  created_at: ago(ageMs),
  read_at: readAgeMs === null ? null : ago(readAgeMs),
});

describe('summarizeLaneDeadLetterRates — FR-4 per-lane rate, live-extent-only', () => {
  it('CONTROL: a lane with zero rows has rate 0, not NaN/undefined (division-by-zero guard)', () => {
    const out = summarizeLaneDeadLetterRates([], { nowMs: NOW });
    for (const lane of LANES) {
      expect(out.lanes[lane].total).toBe(0);
      expect(out.lanes[lane].rate).toBe(0);
    }
  });

  it('CONTROL: an untracked-kind row (roll_call) is excluded from every lane bucket entirely, not silently folded into one', () => {
    const out = summarizeLaneDeadLetterRates([row('roll_call', 999 * HOUR)], { nowMs: NOW });
    const totals = LANES.reduce((sum, lane) => sum + out.lanes[lane].total, 0);
    expect(totals).toBe(0);
  });

  it('names its denominator extent explicitly on every result (never left implicit)', () => {
    const out = summarizeLaneDeadLetterRates([], { nowMs: NOW });
    expect(out.denominator_extent).toBe('live-extent-only');
    expect(out.denominator_extent).toBe(DENOMINATOR_EXTENT);
  });

  it('a directive-lane row expired-unread past its TTL counts toward expired_unread and the rate', () => {
    const rows = [
      row('work_assignment', 3 * HOUR), // past 2h directive TTL, unread
      row('coordinator_directive', 1000, 500), // fresh, read -- not expired
    ];
    const out = summarizeLaneDeadLetterRates(rows, { nowMs: NOW });
    expect(out.lanes.directive.total).toBe(2);
    expect(out.lanes.directive.expired_unread).toBe(1);
    expect(out.lanes.directive.rate).toBe(0.5);
  });

  it('TS-6 / CONTROL: dispatch_suggestion rows unread past TTL count as structurally_artifact_prone, NOT expired_unread -- a naive gauge that classified every unread-past-TTL row identically per lane would fail this by putting them in expired_unread instead', () => {
    const rows = [
      row('dispatch_suggestion', 999 * HOUR), // ancient, unread, no drain-set ever owns it
      row('dispatch_override', 999 * HOUR),
    ];
    const out = summarizeLaneDeadLetterRates(rows, { nowMs: NOW });
    expect(out.lanes.suggestion.total).toBe(2);
    expect(out.lanes.suggestion.expired_unread).toBe(0);
    expect(out.lanes.suggestion.structurally_artifact_prone).toBe(2);
    expect(out.lanes.suggestion.rate).toBe(0); // never misreported as a real delivery failure
  });

  it('an advisory-lane row (adam_advisory, a real DRAIN_SET member) unread past TTL IS a genuine expired_unread, unlike the suggestion lane', () => {
    const out = summarizeLaneDeadLetterRates([row('adam_advisory', 25 * HOUR)], { nowMs: NOW });
    expect(out.lanes.advisory.expired_unread).toBe(1);
    expect(out.lanes.advisory.structurally_artifact_prone).toBe(0);
  });

  it('a read row never counts toward expired_unread regardless of age', () => {
    const out = summarizeLaneDeadLetterRates([row('work_assignment', 999 * HOUR, 1000)], { nowMs: NOW });
    expect(out.lanes.directive.expired_unread).toBe(0);
    expect(out.lanes.directive.total).toBe(1);
  });
});

describe('fetchAllLiveCoordinationRows — TS-5 full-population pagination, never a single capped page', () => {
  it('CONTROL: a naive single .limit(pageSize) fetch would return only the first page -- this function must return ALL pages concatenated', async () => {
    const pageSize = 3;
    const allRows = Array.from({ length: 7 }, (_, i) => ({ payload: { kind: 'work_assignment' }, created_at: ago(i), read_at: null, id: i }));
    const calls = [];
    const supabase = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: (from, to) => {
              calls.push([from, to]);
              return Promise.resolve({ data: allRows.slice(from, to + 1), error: null });
            },
          }),
        }),
      }),
    };
    const result = await fetchAllLiveCoordinationRows(supabase, { pageSize });
    expect(result).toHaveLength(7); // NOT 3 (the single-page count) -- proves pagination continued
    expect(calls.length).toBeGreaterThan(1);
  });

  it('stops after a short/empty page, never loops forever', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };
    const result = await fetchAllLiveCoordinationRows(supabase, { pageSize: 5 });
    expect(result).toEqual([]);
  });

  it('propagates a query error rather than silently returning a partial population', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: null, error: new Error('db down') }),
          }),
        }),
      }),
    };
    await expect(fetchAllLiveCoordinationRows(supabase, { pageSize: 5 })).rejects.toThrow('db down');
  });
});

describe('computeLaneDeadLetterGauge — TS-5, matches an independent full-count summary and is stable across repeated calls', () => {
  it('the paginated live gauge and a directly-summarized full population agree exactly on the same data (no capped-fetch inconsistency)', async () => {
    const pageSize = 4;
    const allRows = [
      row('work_assignment', 5 * HOUR),
      row('coordinator_directive', 900),
      row('adam_advisory', 25 * HOUR),
      row('coordinator_reply', 900),
      row('dispatch_suggestion', 999 * HOUR),
      row('dispatch_override', 999 * HOUR),
      row('roll_call', 1),
      row('coordinator_reservation', 900),
      row('coordinator_reservation', 30 * HOUR),
    ];
    const supabase = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: (from, to) => Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
          }),
        }),
      }),
    };
    const viaGauge = await computeLaneDeadLetterGauge(supabase, { nowMs: NOW, pageSize });
    const viaDirect = summarizeLaneDeadLetterRates(allRows, { nowMs: NOW });
    expect(viaGauge.lanes).toEqual(viaDirect.lanes);

    // Stability: invoking the paginated gauge twice against the same fixed population
    // yields identical results -- the "CAP≠POP" defect this session reproduced live
    // against coordination_receipts showed inconsistent results across repeated calls.
    const again = await computeLaneDeadLetterGauge(supabase, { nowMs: NOW, pageSize });
    expect(again.lanes).toEqual(viaGauge.lanes);
  });
});

describe('buildBaselineRecord / recordDeadLetterBaseline — FR-5 day-0 post-fix baseline', () => {
  it('CONTROL: rejects an unrecognized label rather than silently recording an untyped baseline', () => {
    expect(() => buildBaselineRecord({ lanes: {} }, { label: 'pre-fix-reconstructed' })).toThrow();
  });

  it('day-0-post-fix carries the disproven-original-baseline documentation; 30-day-remeasurement does not', () => {
    const gauge = { denominator_extent: 'live-extent-only', computed_at: 'x', lanes: {} };
    const day0 = buildBaselineRecord(gauge, { label: 'day-0-post-fix' });
    expect(day0.disproven_original_baseline).toEqual(DISPROVEN_ORIGINAL_BASELINE);
    expect(day0.disproven_original_baseline.coordinator_directive_pct).toBe(62);
    expect(day0.disproven_original_baseline.dispatch_suggestion_pct).toBe(100);

    const remeasure = buildBaselineRecord(gauge, { label: '30-day-remeasurement' });
    expect(remeasure.disproven_original_baseline).toBeUndefined();
  });

  it('the label is never silently dropped or renamed', () => {
    const gauge = { lanes: {} };
    expect(buildBaselineRecord(gauge, { label: 'day-0-post-fix' }).label).toBe('day-0-post-fix');
  });

  it('recordDeadLetterBaseline inserts a system_events row with the SD event_type and the full record as payload', async () => {
    const inserted = [];
    const supabase = { from: (table) => ({ insert: (r) => { inserted.push({ table, r }); return Promise.resolve({ error: null }); } }) };
    const record = buildBaselineRecord({ lanes: {} }, { label: 'day-0-post-fix' });
    await recordDeadLetterBaseline(supabase, record);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('system_events');
    expect(inserted[0].r.event_type).toBe(BASELINE_EVENT_TYPE);
    expect(inserted[0].r.payload).toEqual(record);
  });

  it('CONTROL: never throws even if the insert fails (fail-soft, mirrors recordWouldDenyEvidence)', async () => {
    const supabase = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) };
    const record = buildBaselineRecord({ lanes: {} }, { label: 'day-0-post-fix' });
    await expect(recordDeadLetterBaseline(supabase, record)).resolves.toBeUndefined();
  });
});
