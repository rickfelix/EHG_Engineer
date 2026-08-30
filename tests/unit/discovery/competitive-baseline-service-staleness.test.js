/**
 * SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001 -- TS-2, TS-3, TS-7.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompetitiveBaselineService } from '../../../lib/discovery/competitive-baseline-service.js';

vi.mock('../../../lib/eva/utils/web-search.js', () => ({
  isSearchEnabled: vi.fn(),
  search: vi.fn(),
}));
import { isSearchEnabled, search } from '../../../lib/eva/utils/web-search.js';

function fakeSupabase({ rows = [], insertReturn, existing = null }) {
  const inserted = [];
  const updated = [];
  return {
    inserted,
    updated,
    from(table) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: rows, error: null }),
        maybeSingle: () => Promise.resolve({ data: existing, error: null }),
        insert: (payload) => {
          inserted.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: insertReturn ?? { id: 'new-id', ...payload }, error: null }),
            }),
          };
        },
        update: (payload) => {
          updated.push(payload);
          return {
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: existing?.id, ...payload }, error: null }),
              }),
            }),
          };
        },
      };
      return chain;
    },
  };
}

describe('CompetitiveBaselineService staleness + create', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('TS-3: create() round-trips produced_at/expires_at/citations as non-null (column-whitelist fix)', async () => {
    const sb = fakeSupabase({ rows: [] });
    const service = new CompetitiveBaselineService(sb);
    await service.create({
      venture_id: 'v1',
      competitor_name: 'Acme',
      produced_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-31T00:00:00.000Z',
      citations: [{ source_url: 'https://example.com', title: 'x', retrieved_at: '2026-01-01T00:00:00.000Z', origin_independent: true }],
    });
    expect(sb.inserted[0].produced_at).toBe('2026-01-01T00:00:00.000Z');
    expect(sb.inserted[0].expires_at).toBe('2026-01-31T00:00:00.000Z');
    expect(sb.inserted[0].citations).toHaveLength(1);
  });

  it('TS-2: a NULL expires_at row (pre-existing STATUS_QUO placeholder) is treated as stale, not fresh', async () => {
    const sb = fakeSupabase({ rows: [{ id: 'b1', baseline_type: 'COMPETITOR', expires_at: null }] });
    const service = new CompetitiveBaselineService(sb);
    const fresh = await service.getFreshOrNull('v1');
    expect(fresh).toBeNull();
  });

  it('TS-2: exact-boundary (now === expires_at) is treated as EXPIRED, not fresh', async () => {
    const boundary = '2026-06-01T00:00:00.000Z';
    const sb = fakeSupabase({ rows: [{ id: 'b1', baseline_type: 'COMPETITOR', expires_at: boundary }] });
    const service = new CompetitiveBaselineService(sb);
    const fresh = await service.getFreshOrNull('v1', { now: () => new Date(boundary) });
    expect(fresh).toBeNull();
  });

  it('TS-2: a baseline expiring 1ms in the future IS fresh', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 1).toISOString();
    const sb = fakeSupabase({ rows: [{ id: 'b1', baseline_type: 'COMPETITOR', expires_at: expiresAt }] });
    const service = new CompetitiveBaselineService(sb);
    const fresh = await service.getFreshOrNull('v1', { now: () => now });
    expect(fresh).toHaveLength(1);
  });

  it('TS-7: a research call returning zero results falls back to a SHORT TTL, not the full shelf life', async () => {
    isSearchEnabled.mockReturnValue(true);
    search.mockResolvedValue([]);
    const sb = fakeSupabase({ rows: [] });
    const service = new CompetitiveBaselineService(sb);
    const now = new Date('2026-06-01T00:00:00.000Z');
    await service.researchAndCreate('v1', 'Acme', { now: () => now });
    const written = sb.inserted[0];
    const ttlMs = new Date(written.expires_at).getTime() - now.getTime();
    expect(ttlMs).toBeLessThan(24 * 60 * 60 * 1000); // well under the 30-day shelf life
    expect(ttlMs).toBeGreaterThan(0);
  });

  it('TS-7: a successful research call gets the FULL shelf life, not the short fallback TTL', async () => {
    isSearchEnabled.mockReturnValue(true);
    search.mockResolvedValue([{ title: 'Acme', url: 'https://acme.example.com', content: 'pricing info', score: 0.9 }]);
    const sb = fakeSupabase({ rows: [] });
    const service = new CompetitiveBaselineService(sb);
    const now = new Date('2026-06-01T00:00:00.000Z');
    await service.researchAndCreate('v1', 'Acme', { now: () => now });
    const written = sb.inserted[0];
    const ttlDays = (new Date(written.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(ttlDays).toBeGreaterThan(20); // full 30-day shelf life, not the 6h fallback
    expect(written.citations).toHaveLength(1);
    expect(written.citations[0].source_url).toBe('https://acme.example.com');
    expect(written.epistemic_tag).toBe('OBSERVED');
  });

  it('TS-7: a repeat researchAndCreate for the same venture+competitor UPDATES the existing row, not a duplicate insert', async () => {
    isSearchEnabled.mockReturnValue(true);
    search.mockResolvedValue([{ title: 'Acme', url: 'https://acme.example.com', content: 'pricing info', score: 0.9 }]);
    const sb = fakeSupabase({ rows: [], existing: { id: 'existing-row-1' } });
    const service = new CompetitiveBaselineService(sb);
    const now = new Date('2026-06-01T00:00:00.000Z');
    await service.researchAndCreate('v1', 'Acme', { now: () => now });
    expect(sb.inserted).toHaveLength(0);
    expect(sb.updated).toHaveLength(1);
    expect(sb.updated[0].venture_id).toBe('v1');
    expect(sb.updated[0].competitor_name).toBe('Acme');
  });
});
