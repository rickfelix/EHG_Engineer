/**
 * lib/apa/venture-cause-capture.js — SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-1.
 * PRD test scenarios TS-1 through TS-4.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  redactText,
  boundedLeg,
  captureCloudflareLogs,
  queryVentureD1,
  queryVentureErrors,
  assembleCapturedCause,
  ABSENT_REASONS,
} from '../../../lib/apa/venture-cause-capture.js';

const WINDOW = { from: '2026-09-11T10:00:00.000Z', to: '2026-09-11T10:05:00.000Z' };

describe('redactText', () => {
  it('redacts bearer tokens, api keys, long hex/base64 runs and emails, then truncates', () => {
    const out = redactText('Authorization: Bearer sk-abc123XYZ token=verylonglooking apikey=deadbeef1234deadbeef1234deadbeef user@example.com ' + 'x'.repeat(300));
    expect(out).not.toContain('sk-abc123XYZ');
    expect(out).not.toContain('deadbeef1234deadbeef1234deadbeef');
    expect(out).not.toContain('user@example.com');
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('is a no-op on ordinary short diagnostic text', () => {
    expect(redactText('GENERATION_FAILED after 5s')).toBe('GENERATION_FAILED after 5s');
  });

  it('handles non-string / empty input without throwing', () => {
    expect(redactText(null)).toBe('');
    expect(redactText(undefined)).toBe('');
    expect(redactText('')).toBe('');
  });
});

describe('boundedLeg', () => {
  it('TS-1: a populated leg carries required non-null producer/run_id/content_hash', () => {
    const leg = boundedLeg({ producer: 'test_producer', run_id: 'run-123', rawItems: ['item one', 'item two'] });
    expect(leg.absent).toBe(false);
    expect(leg.producer).toBe('test_producer');
    expect(leg.run_id).toBeTruthy();
    expect(leg.content_hash).toBeTruthy();
    expect(leg.item_count).toBe(2);
    expect(leg.items).toEqual(['item one', 'item two']);
  });

  it('falls back run_id to the content_hash when the source has none of its own', () => {
    const leg = boundedLeg({ producer: 'p', run_id: null, rawItems: ['x'] });
    expect(leg.run_id).toBe(leg.content_hash);
  });

  it('TS-2: a genuinely empty-but-successful leg is absent:false, item_count:0', () => {
    const leg = boundedLeg({ producer: 'p', run_id: 'r', rawItems: [] });
    expect(leg.absent).toBe(false);
    expect(leg.item_count).toBe(0);
    expect(leg.run_id).toBeTruthy(); // content_hash of empty array, still non-null
  });

  it('TS-3: an absent leg carries no data, only absent:true + a reason', () => {
    const leg = boundedLeg({ producer: 'p', run_id: null, absent: true, absent_reason: ABSENT_REASONS.FETCH_FAILED });
    expect(leg.absent).toBe(true);
    expect(leg.absent_reason).toBe('fetch_failed');
    expect(leg.item_count).toBe(0);
    expect(leg.run_id).toBeNull();
    expect(leg.content_hash).toBeNull();
  });

  it('TS-4: truncates to 10 items and sets items_truncated', () => {
    const rawItems = Array.from({ length: 15 }, (_, i) => `item-${i}`);
    const leg = boundedLeg({ producer: 'p', run_id: 'r', rawItems });
    expect(leg.items).toHaveLength(10);
    expect(leg.items_truncated).toBe(true);
  });

  it('does not set items_truncated when under the cap', () => {
    const leg = boundedLeg({ producer: 'p', run_id: 'r', rawItems: ['a', 'b', 'c'] });
    expect(leg.items_truncated).toBe(false);
  });
});

describe('captureCloudflareLogs', () => {
  it('is absent (not_attempted) when credentials are missing', async () => {
    const leg = await captureCloudflareLogs({ workerName: 'altifyai', window: WINDOW, env: {} });
    expect(leg.absent).toBe(true);
    expect(leg.absent_reason).toBe(ABSENT_REASONS.NOT_ATTEMPTED);
  });

  it('parses a successful telemetry response (result.events.events shape, live-verified by altifyai QF-20260819-687) into a populated leg with the ray id as run_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (k) => (k === 'cf-ray' ? 'ray-abc-123' : null) },
      json: async () => ({ success: true, result: { events: { events: [{ '$metadata': { level: 'error', message: 'GENERATION_FAILED' } }] } } }),
    });
    const leg = await captureCloudflareLogs({
      workerName: 'altifyai',
      window: WINDOW,
      env: { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' },
      fetchImpl,
    });
    expect(leg.absent).toBe(false);
    expect(leg.run_id).toBe('ray-abc-123');
    expect(leg.item_count).toBe(1);
    expect(leg.items[0]).toContain('GENERATION_FAILED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain('/accounts/acct/workers/observability/telemetry/query');
    expect(opts.headers.authorization).toBe('Bearer tok');
    const body = JSON.parse(opts.body);
    // Epoch MILLISECONDS, not an ISO string -- an ISO/seconds timeframe silently returns an
    // empty result set rather than an error (altifyai's own measured incident).
    expect(typeof body.timeframe.from).toBe('number');
    expect(typeof body.timeframe.to).toBe('number');
    expect(body.parameters.datasets).toEqual(['cloudflare-workers']);
    expect(body.parameters.filters[0]).toMatchObject({ key: '$metadata.service', operation: 'eq', value: 'altifyai' });
  });

  it('falls back to a same-shaped array walk when result.events.events is absent (older/alternate response shape)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ success: true, result: { someOtherKey: [{ '$metadata': { message: 'fallback path' } }] } }),
    });
    const leg = await captureCloudflareLogs({ workerName: 'altifyai', window: WINDOW, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, fetchImpl });
    expect(leg.absent).toBe(false);
    expect(leg.item_count).toBe(1);
    expect(leg.items[0]).toContain('fallback path');
  });

  it('an empty result.events.events (real zero-match query) is absent:false, item_count:0 -- never falls through to the walk fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      // Regression guard for the exact bug QF-20260819-687 measured: result.events.series is
      // a same-shaped decoy array present alongside a genuinely empty events.events.
      json: async () => ({ success: true, result: { events: { events: [], series: [{ time: 't', data: [1, 2, 3] }] } } }),
    });
    const leg = await captureCloudflareLogs({ workerName: 'altifyai', window: WINDOW, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, fetchImpl });
    expect(leg.absent).toBe(false);
    expect(leg.item_count).toBe(0);
  });

  it('TS-3: degrades to absent(fetch_failed) on a non-2xx response, never throws', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ success: false, errors: [{ message: 'unauthorized' }] }) });
    const leg = await captureCloudflareLogs({ workerName: 'altifyai', window: WINDOW, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, fetchImpl });
    expect(leg.absent).toBe(true);
    expect(leg.absent_reason).toBe(ABSENT_REASONS.FETCH_FAILED);
  });

  it('degrades to absent(fetch_failed) when fetch itself throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const leg = await captureCloudflareLogs({ workerName: 'altifyai', window: WINDOW, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, fetchImpl });
    expect(leg.absent).toBe(true);
    expect(leg.absent_reason).toBe(ABSENT_REASONS.FETCH_FAILED);
  });
});

describe('queryVentureD1', () => {
  it('is absent (not_attempted) when credentials or databaseName are missing', async () => {
    const leg = await queryVentureD1({ databaseName: null, window: WINDOW, env: {} });
    expect(leg.absent).toBe(true);
    expect(leg.absent_reason).toBe(ABSENT_REASONS.NOT_ATTEMPTED);
  });

  it('resolves the database id live, then queries generated_alt_texts', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: [{ uuid: 'db-uuid-1', name: 'altifyai' }] }) })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'ray-d1-1' },
        json: async () => ({ success: true, result: [{ results: [{ failure_code: 'GENERATION_FAILED', failure_detail: 'provider_status=500;classification=GENERATION_FAILED', created_at: '2026-09-11T10:02:30Z' }] }] }),
      });
    const leg = await queryVentureD1({ databaseName: 'altifyai', window: WINDOW, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, fetchImpl });
    expect(leg.absent).toBe(false);
    expect(leg.item_count).toBe(1);
    expect(leg.items[0]).toContain('GENERATION_FAILED');
    expect(fetchImpl.mock.calls[1][0]).toContain('/d1/database/db-uuid-1/query');
  });

  it('TS-3: is absent(capture_not_ready) when no database matches the name', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: [] }) });
    const leg = await queryVentureD1({ databaseName: 'nonexistent', window: WINDOW, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, fetchImpl });
    expect(leg.absent).toBe(true);
    expect(leg.absent_reason).toBe(ABSENT_REASONS.CAPTURE_NOT_READY);
  });
});

describe('queryVentureErrors', () => {
  it('is absent (not_attempted) when ventureId or supabase is missing', async () => {
    const leg = await queryVentureErrors({ ventureId: null, window: WINDOW, supabase: {} });
    expect(leg.absent).toBe(true);
  });

  it('reads feedback rows scoped by venture_id + feedback_type + last_seen window', async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ id: 'fb-1', error_hash: 'h1', occurrence_count: 3, error_message: 'boom', last_seen: '2026-09-11T10:02:00Z' }], error: null }) };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const leg = await queryVentureErrors({ ventureId: 'venture-1', window: WINDOW, supabase });
    expect(supabase.from).toHaveBeenCalledWith('feedback');
    expect(chain.eq).toHaveBeenCalledWith('venture_id', 'venture-1');
    expect(chain.eq).toHaveBeenCalledWith('feedback_type', 'venture_error');
    expect(leg.absent).toBe(false);
    expect(leg.item_count).toBe(1);
    expect(leg.run_id).toBe('fb-1');
  });

  it('TS-2: zero matching rows is absent:false, item_count:0 (not absent:true)', async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const leg = await queryVentureErrors({ ventureId: 'venture-1', window: WINDOW, supabase });
    expect(leg.absent).toBe(false);
    expect(leg.item_count).toBe(0);
  });
});

describe('assembleCapturedCause', () => {
  const populatedLeg = (n) => ({ producer: 'p', run_id: 'r', content_hash: 'h', item_count: n, items: Array.from({ length: n }, (_, i) => `item-${i}`), items_truncated: false, absent: false, absent_reason: null });
  const absentLegObj = (reason) => ({ producer: 'p', run_id: null, content_hash: null, item_count: 0, items: [], items_truncated: false, absent: true, absent_reason: reason });

  it('TS-1: assembles all three legs in parallel with full provenance when all succeed', async () => {
    const deps = {
      captureCloudflareLogs: vi.fn().mockResolvedValue(populatedLeg(2)),
      queryVentureD1: vi.fn().mockResolvedValue(populatedLeg(1)),
      queryVentureErrors: vi.fn().mockResolvedValue(populatedLeg(3)),
    };
    const result = await assembleCapturedCause({ ventureId: 'v1', workerName: 'altifyai', databaseName: 'altifyai', window: WINDOW, supabase: {}, deps });
    expect(result.worker_logs.absent).toBe(false);
    expect(result.venture_errors.absent).toBe(false);
    expect(result.d1_failures.absent).toBe(false);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.window).toEqual(WINDOW);
  });

  it('TS-2: a summary distinguishes "found nothing" from "capture unavailable"', async () => {
    const emptyLeg = populatedLeg(0);
    const deps = {
      captureCloudflareLogs: vi.fn().mockResolvedValue(emptyLeg),
      queryVentureD1: vi.fn().mockResolvedValue(emptyLeg),
      queryVentureErrors: vi.fn().mockResolvedValue(emptyLeg),
    };
    const result = await assembleCapturedCause({ ventureId: 'v1', workerName: 'w', databaseName: 'd', window: WINDOW, supabase: {}, deps });
    expect(result.summary).toContain('capture succeeded');
    expect(result.summary).not.toContain('did not complete');
  });

  it('TS-3: a fully-absent capture summarizes as "did not complete", not as an empty search', async () => {
    const deps = {
      captureCloudflareLogs: vi.fn().mockResolvedValue(absentLegObj('fetch_failed')),
      queryVentureD1: vi.fn().mockResolvedValue(absentLegObj('not_attempted')),
      queryVentureErrors: vi.fn().mockResolvedValue(absentLegObj('fetch_failed')),
    };
    const result = await assembleCapturedCause({ ventureId: 'v1', workerName: 'w', databaseName: 'd', window: WINDOW, supabase: {}, deps });
    expect(result.summary).toContain('did not complete');
  });

  it('never throws even when a dep rejects — degrades that leg to absent(dispatch_failed)', async () => {
    const deps = {
      captureCloudflareLogs: vi.fn().mockRejectedValue(new Error('boom')),
      queryVentureD1: vi.fn().mockResolvedValue(populatedLeg(1)),
      queryVentureErrors: vi.fn().mockResolvedValue(populatedLeg(1)),
    };
    const result = await assembleCapturedCause({ ventureId: 'v1', workerName: 'w', databaseName: 'd', window: WINDOW, supabase: {}, deps });
    expect(result.worker_logs.absent).toBe(true);
    expect(result.worker_logs.absent_reason).toBe('dispatch_failed');
  });

  it('TS-4: enforces the ~8KB total backstop by trimming the largest leg', async () => {
    const bigLeg = populatedLeg(10);
    bigLeg.items = Array.from({ length: 10 }, () => 'x'.repeat(199));
    const deps = {
      captureCloudflareLogs: vi.fn().mockResolvedValue({ ...bigLeg }),
      queryVentureD1: vi.fn().mockResolvedValue({ ...bigLeg }),
      queryVentureErrors: vi.fn().mockResolvedValue({ ...bigLeg }),
    };
    const result = await assembleCapturedCause({ ventureId: 'v1', workerName: 'w', databaseName: 'd', window: WINDOW, supabase: {}, deps });
    const size = Buffer.byteLength(JSON.stringify(result), 'utf8');
    expect(size).toBeLessThanOrEqual(8 * 1024);
  });
});
