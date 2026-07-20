// SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-1)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { fetchSignal, SOURCE_NAME, TRANSFORM_VERSION } from '../../../lib/market-signal-scanner/sources/wordpress-plugins.js';

const SEARCH_BODY = JSON.stringify({
  plugins: [{ slug: 'akismet', name: 'Akismet', active_installs: 5000000, downloaded: 500000000 }],
});

const DETAIL_BODY = JSON.stringify({
  name: 'Akismet',
  slug: 'akismet',
  active_installs: 5000000,
  downloaded: 500000000,
  rating: 82,
  num_ratings: 900,
  added: '2005-01-01',
});

/** Chainable fake Supabase client covering the select().eq().eq().eq().gte().lte() + insert() paths. */
function buildSupabase({ rows = [] } = {}) {
  const insertedRows = [];
  // FR-6 batch 8: computeSlopeAndPersist now paginates via fetchAllPaginated (.lte().order().range())
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  };
  return {
    insertedRows,
    from: (table) => ({
      select: () => chain,
      insert: async (row) => {
        insertedRows.push({ table, row });
        return { data: null, error: null };
      },
    }),
  };
}

function mockFetchOk() {
  return vi.fn(async (url) => {
    if (String(url).includes('query_plugins')) {
      return { ok: true, text: async () => SEARCH_BODY };
    }
    return { ok: true, text: async () => DETAIL_BODY };
  });
}

describe('wordpress-plugins fetchSignal (SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 FR-1)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('(a) returns readings shaped per the FamilyReading interface (money_in + stickiness, >=1 observation each)', async () => {
    global.fetch = mockFetchOk();
    const priorRows = [
      { raw_value: 4000000, fetched_at: '2025-08-01T00:00:00.000Z' },
      { raw_value: 4900000, fetched_at: '2026-06-01T00:00:00.000Z' },
    ];
    const supabase = buildSupabase({ rows: priorRows });

    const result = await fetchSignal({ query: { term: 'akismet' }, supabase });

    expect(result.errors).toEqual([]);
    expect(result.readings).toHaveLength(2);

    const families = result.readings.map((r) => r.family).sort();
    expect(families).toEqual(['money_in', 'stickiness']);

    for (const reading of result.readings) {
      expect(['money_in', 'stickiness']).toContain(reading.family);
      expect(typeof reading.slope_90d_vs_baseline === 'number' || reading.slope_90d_vs_baseline === null).toBe(true);
      expect(Array.isArray(reading.observations)).toBe(true);
      expect(reading.observations.length).toBeGreaterThanOrEqual(1);

      const obs = reading.observations[0];
      expect(obs.source).toBe(SOURCE_NAME);
      expect(obs.raw_value).not.toBeNull();
      expect(typeof obs.source_url).toBe('string');
      expect(obs.source_url).toContain('akismet');
      expect(typeof obs.content_hash).toBe('string');
      expect(obs.content_hash).toHaveLength(64); // sha256 hex
      expect(() => new Date(obs.fetched_at).toISOString()).not.toThrow();
      expect(obs.transform_version).toBe(TRANSFORM_VERSION);
    }

    // With 2 prior rows spanning baseline + recent windows, a numeric slope is computable.
    const moneyIn = result.readings.find((r) => r.family === 'money_in');
    expect(typeof moneyIn.slope_90d_vs_baseline).toBe('number');

    // The observation was persisted for future cycles (one insert per family).
    expect(supabase.insertedRows).toHaveLength(2);
  });

  it('(b) content_hash is a real sha256 of the raw detail response text', async () => {
    global.fetch = mockFetchOk();
    const supabase = buildSupabase({ rows: [] });

    const result = await fetchSignal({ query: { term: 'akismet' }, supabase });

    const expectedHash = createHash('sha256').update(DETAIL_BODY).digest('hex');
    for (const reading of result.readings) {
      expect(reading.observations[0].content_hash).toBe(expectedHash);
    }
  });

  it('(c) first-ever call for a query_term returns slope_90d_vs_baseline: null (no baseline yet)', async () => {
    global.fetch = mockFetchOk();
    const supabase = buildSupabase({ rows: [] }); // no prior history at all

    const result = await fetchSignal({ query: { term: 'akismet' }, supabase });

    expect(result.errors).toEqual([]);
    for (const reading of result.readings) {
      expect(reading.slope_90d_vs_baseline).toBeNull();
    }
    // Still persists this cycle's observations so a *future* call has a baseline.
    expect(supabase.insertedRows).toHaveLength(2);
  });

  it('(c-bis) no supabase client provided also yields null slopes (can\'t read/write history) without throwing', async () => {
    global.fetch = mockFetchOk();
    const result = await fetchSignal({ query: { term: 'akismet' } });
    expect(result.errors).toEqual([]);
    for (const reading of result.readings) {
      expect(reading.slope_90d_vs_baseline).toBeNull();
    }
  });

  it('(d) a live-call failure (network throw) returns { readings: [], errors: [...] } rather than throwing', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET simulated');
    });

    let result;
    await expect((async () => { result = await fetchSignal({ query: { slug: 'akismet' } }); })()).resolves.not.toThrow();

    expect(result.readings).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/ECONNRESET simulated/);
  });

  it('(d-bis) a non-2xx HTTP response returns { readings: [], errors: [...] } rather than throwing', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, text: async () => '' }));

    const result = await fetchSignal({ query: { slug: 'akismet' } });
    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/503/);
  });

  it('returns an error (not a throw) when neither query.term nor query.slug is provided', async () => {
    const result = await fetchSignal({ query: {} });
    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/query.term or query.slug/);
  });

  it('returns an error when search finds zero candidates for the term', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ plugins: [] }) }));
    const result = await fetchSignal({ query: { term: 'zzz-no-such-plugin-zzz' } });
    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/no search results/);
  });
});
