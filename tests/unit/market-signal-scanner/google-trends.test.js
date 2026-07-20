/**
 * Tests for the Google Trends source fetcher (FR-1).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSignal, __internal } from '../../../lib/market-signal-scanner/sources/google-trends.js';

const XSSI_PREFIX = ")]}',";

function exploreBody() {
  return {
    widgets: [
      {
        id: 'TIMESERIES',
        token: 'test-widget-token',
        type: 'fe_line_chart',
        request: {
          time: '2025-07-16 2026-07-16',
          resolution: 'WEEK',
          locale: 'en-US',
          comparisonItem: [
            { geo: {}, complexKeywordsRestriction: { keyword: [{ type: 'BROAD', value: 'footool' }] } },
          ],
          requestOptions: { property: '', backend: 'IZG', category: 0 },
        },
      },
    ],
  };
}

function multilineBody(values) {
  return {
    default: {
      timelineData: values.map((v, i) => ({
        time: String(1614556800 + i * 604800),
        formattedTime: `Week ${i + 1}`,
        formattedAxisTime: `Week ${i + 1}`,
        value: [v],
        hasData: [true],
        formattedValue: [String(v)],
      })),
      averages: [{ value: Math.round(values.reduce((a, b) => a + b, 0) / values.length) }],
    },
  };
}

/** Wraps a JS object as the real wire format: ")]}'," prefix + JSON text. */
function xssiText(obj) {
  return `${XSSI_PREFIX}\n${JSON.stringify(obj)}`;
}

function mockExploreThenMultiline({ explore = exploreBody(), multiline = multilineBody([10, 15, 20]) } = {}) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xssiText(explore)) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xssiText(multiline)) }),
  );
}

function makeSupabaseMock({ priorRows = [] } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  // FR-6 batch 8: computeSlopeAndPersist now paginates via fetchAllPaginated (.lte().order().range())
  const orderable = { order() { return orderable; }, range: (from, to) => Promise.resolve({ data: priorRows.slice(from, to + 1), error: null }) };
  const lte = vi.fn(() => orderable);
  const gte = vi.fn(() => ({ lte }));
  const eq3 = vi.fn(() => ({ gte }));
  const eq2 = vi.fn(() => ({ eq: eq3 }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select, insert }));
  return { from, __insert: insert, __gte: gte, __lte: lte };
}

describe('google-trends source fetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(a) strips the ")]}\'," XSSI prefix and parses both responses correctly', async () => {
    mockExploreThenMultiline();

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.errors).toEqual([]);
    expect(result.readings).toHaveLength(1);

    const reading = result.readings[0];
    expect(reading.family).toBe('attention');
    expect(reading.observations).toHaveLength(1);

    const observation = reading.observations[0];
    // meanInterest of [10, 15, 20] = 15; latestValue = last point = 20
    expect(observation.raw_value.meanInterest).toBe(15);
    expect(observation.raw_value.latestValue).toBe(20);
    expect(observation.raw_value.pointCount).toBe(3);
    expect(observation.source).toBe('google_trends');
    expect(observation.transform_version).toBe('v1');

    // Verify the two-step call sequence
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('trends.google.com/trends/api/explore'));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('trends.google.com/trends/api/widgetdata/multiline'),
    );
  });

  it('directly proves the XSSI-prefix stripping helper parses a raw-wire-format string', () => {
    const obj = { default: { timelineData: [] } };
    const raw = xssiText(obj);
    expect(raw.startsWith(XSSI_PREFIX)).toBe(true);
    expect(() => JSON.parse(raw)).toThrow(); // un-stripped text is not valid JSON
    expect(__internal.parseXssiJson(raw)).toEqual(obj);
  });

  it('(b) fetch network failure returns { readings: [], errors: [...] } without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.readings).toEqual([]);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors[0]).toMatch(/google_trends explore request failed/);
  });

  it('(b) a non-OK HTTP response returns { readings: [], errors: [...] } without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/HTTP 429/);
  });

  it('(b) a malformed (non-JSON) explore response returns { readings: [], errors: [...] } without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(`${XSSI_PREFIX}\nnot-json{{{`) }));

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/explore response was not valid JSON/);
  });

  it('(b) a response missing the TIMESERIES widget returns { readings: [], errors: [...] } without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xssiText({ widgets: [] })) }));

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/no TIMESERIES widget/);
  });

  it('(b) an empty timelineData array returns { readings: [], errors: [...] } without throwing', async () => {
    mockExploreThenMultiline({ multiline: { default: { timelineData: [] } } });

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/no interest-over-time data/);
  });

  it('(b) fails soft (no throw) with query.term missing', async () => {
    const result = await fetchSignal({ query: {} });

    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/query.term is required/);
  });

  it('(c) content_hash is a real sha256 of the raw (prefixed) widgetdata response text', async () => {
    const crypto = await import('node:crypto');
    const multiline = multilineBody([5, 8, 13]);
    mockExploreThenMultiline({ multiline });

    const result = await fetchSignal({ query: { term: 'footool' } });
    const observation = result.readings[0].observations[0];

    expect(observation.content_hash).toMatch(/^[a-f0-9]{64}$/);

    const expectedHash = crypto.createHash('sha256').update(xssiText(multiline)).digest('hex');
    expect(observation.content_hash).toBe(expectedHash);
  });

  it('(d) first-ever call for a (source, query_term) returns slope_90d_vs_baseline: null, and still persists the observation', async () => {
    mockExploreThenMultiline();

    const supabase = makeSupabaseMock({ priorRows: [] }); // no prior history at all
    const result = await fetchSignal({ query: { term: 'brand-new-niche' }, supabase });

    expect(result.readings[0].slope_90d_vs_baseline).toBeNull();
    expect(supabase.__insert).toHaveBeenCalledTimes(1);
    const insertedRow = supabase.__insert.mock.calls[0][0];
    expect(insertedRow.source).toBe('google_trends');
    expect(insertedRow.family).toBe('attention');
    expect(insertedRow.query_term).toBe('brand-new-niche');
  });

  it('with prior history, computes a non-null slope as recent-90d avg minus 12mo-baseline avg', async () => {
    mockExploreThenMultiline({ multiline: multilineBody([30, 30, 30]) }); // meanInterest = 30

    const now = Date.now();
    const priorRows = [
      // baseline-only row (outside the trailing 90 days)
      { raw_value: { meanInterest: 10 }, fetched_at: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString() },
      // recent row (within the trailing 90 days)
      { raw_value: { meanInterest: 20 }, fetched_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const supabase = makeSupabaseMock({ priorRows });

    const result = await fetchSignal({ query: { term: 'growing-niche' }, supabase });

    // Corrected (non-contaminated) computation, per lib/market-signal-scanner/slope.js:
    // baseline = only the row strictly older than 90 days (meanInterest=10);
    // recent = only the row within the last 90 days (meanInterest=20) -- the two
    // windows never overlap. Percent-change slope = (20-10)/10*100 = 100.
    expect(result.readings[0].slope_90d_vs_baseline).toBe(100);
  });
});
