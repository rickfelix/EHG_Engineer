/**
 * Tests for the Reddit source fetcher (FR-1).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSignal } from '../../../lib/market-signal-scanner/sources/reddit.js';

const savedClientId = process.env.REDDIT_CLIENT_ID;
const savedClientSecret = process.env.REDDIT_CLIENT_SECRET;

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

function mockTokenThenSearch(searchChildren) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      // 1st call: OAuth token request
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'test-access-token' }),
      })
      // 2nd call: subreddit search request
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { children: searchChildren } }),
      }),
  );
}

describe('reddit source fetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
  });

  afterEach(() => {
    if (savedClientId) process.env.REDDIT_CLIENT_ID = savedClientId;
    else delete process.env.REDDIT_CLIENT_ID;
    if (savedClientSecret) process.env.REDDIT_CLIENT_SECRET = savedClientSecret;
    else delete process.env.REDDIT_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it('(a) returns { readings: [], errors: [...] } without throwing when credentials are missing', async () => {
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;

    const result = await fetchSignal({ query: { term: 'invoicing' } });

    expect(result.readings).toEqual([]);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/REDDIT_CLIENT_ID/);
  });

  it('(b) with mocked credentials + API responses, returns a correctly shaped structural reading with a real sha256 content_hash', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-client-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';

    const children = [
      { data: { title: 'Switching from FooTool, any alternative to it?', selftext: '' } },
      { data: { title: 'Loving FooTool honestly', selftext: 'no complaints here' } },
    ];
    mockTokenThenSearch(children);

    const result = await fetchSignal({ query: { term: 'footool' } });

    expect(result.errors).toEqual([]);
    expect(result.readings).toHaveLength(1);

    const reading = result.readings[0];
    expect(reading.family).toBe('structural');
    expect(reading.observations).toHaveLength(1);
    expect(reading.slope_90d_vs_baseline).toBeNull(); // no supabase -> no baseline history

    const observation = reading.observations[0];
    expect(observation.source).toBe('reddit');
    expect(observation.transform_version).toBe('v1');
    expect(typeof observation.source_url).toBe('string');
    expect(observation.source_url).toContain('oauth.reddit.com');
    expect(typeof observation.fetched_at).toBe('string');
    expect(() => new Date(observation.fetched_at).toISOString()).not.toThrow();

    // content_hash must be a real sha256 hex digest (64 lowercase hex chars)
    expect(observation.content_hash).toMatch(/^[a-f0-9]{64}$/);

    // raw_value should reflect the complaint match found in the mocked children
    expect(observation.raw_value.totalPosts).toBe(2);
    expect(observation.raw_value.complaintMatches).toBe(1);

    // Verify the OAuth flow used the correct token endpoint + Basic auth
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://www.reddit.com/api/v1/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    // Verify the search call used the Bearer token from step 1
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('oauth.reddit.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      }),
    );
  });

  it('(c) first-ever call for a (source, query_term) returns slope_90d_vs_baseline: null', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-client-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';

    mockTokenThenSearch([{ data: { title: 'Hate that this app has no export', selftext: '' } }]);

    const supabase = makeSupabaseMock({ priorRows: [] }); // no prior history at all
    const result = await fetchSignal({ query: { term: 'newniche' }, supabase });

    expect(result.readings[0].slope_90d_vs_baseline).toBeNull();
    // Current observation should still be inserted for future-cycle baselining
    expect(supabase.__insert).toHaveBeenCalledTimes(1);
  });

  it('fails soft (no throw) when the OAuth token request itself errors', async () => {
    process.env.REDDIT_CLIENT_ID = 'test-client-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await fetchSignal({ query: { term: 'invoicing' } });

    expect(result.readings).toEqual([]);
    expect(result.errors[0]).toMatch(/Reddit OAuth failed/);
  });
});
