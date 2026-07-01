/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-2): lib/coordinator/clear-coordinator-review.js
 *
 * The FIRST canonical write-site for metadata.needs_coordinator_review. Covers: the atomic
 * merge query shape (no read-spread-write), that a successful clear triggers a rank pass
 * (and a failed/no-op clear does NOT), and fail-soft behavior on connection/query errors.
 */
import { describe, it, expect, vi } from 'vitest';
import { clearCoordinatorReview, buildClearReviewQuery } from '../../../lib/coordinator/clear-coordinator-review.js';

function fakeClient({ rowCount = 1, queryError = null } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (queryError) throw queryError;
      return { rowCount };
    }),
    end: vi.fn(async () => {}),
  };
}

describe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: clearCoordinatorReview', () => {
  it('throws synchronously on a missing sdKey (programmer error, not a fail-soft path)', async () => {
    await expect(clearCoordinatorReview()).rejects.toThrow('sdKey is required');
  });

  it('issues an atomic || merge (not a read-then-full-write) and closes the connection', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const triggerFn = vi.fn();

    const result = await clearCoordinatorReview('SD-TEST-001', { createClientFn, triggerFn });

    expect(result).toEqual({ cleared: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/metadata\s*\|\|/);
    expect(client.queries[0].sql).not.toMatch(/SELECT/i); // no read-then-write round trip
    expect(client.queries[0].params).toEqual(['SD-TEST-001']);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('uses a service-role client via createDatabaseClient(\'engineer\', ...), matching the ranker\'s convention', async () => {
    const client = fakeClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    await clearCoordinatorReview('SD-TEST-001', { createClientFn, triggerFn: vi.fn() });
    expect(createClientFn).toHaveBeenCalledWith('engineer', { verify: false });
  });

  it('triggers a rank pass ONLY after a successful clear', async () => {
    const client = fakeClient({ rowCount: 1 });
    const triggerFn = vi.fn();
    await clearCoordinatorReview('SD-TEST-001', { createClientFn: async () => client, triggerFn });
    expect(triggerFn).toHaveBeenCalledWith({ reason: 'clear_coordinator_review', sdKey: 'SD-TEST-001' });
  });

  it('does NOT trigger a rank pass when no row matched (sdKey not found)', async () => {
    const client = fakeClient({ rowCount: 0 });
    const triggerFn = vi.fn();
    const result = await clearCoordinatorReview('SD-DOES-NOT-EXIST', { createClientFn: async () => client, triggerFn });
    expect(result).toEqual({ cleared: false, sdKey: 'SD-DOES-NOT-EXIST', error: 'no_matching_row' });
    expect(triggerFn).not.toHaveBeenCalled();
  });

  it('is fail-soft on a DB connection failure (never throws, returns a structured error)', async () => {
    const createClientFn = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const triggerFn = vi.fn();
    const result = await clearCoordinatorReview('SD-TEST-001', { createClientFn, triggerFn });
    expect(result.cleared).toBe(false);
    expect(result.error).toMatch(/db_connect_failed/);
    expect(triggerFn).not.toHaveBeenCalled();
  });

  it('is fail-soft on a query error and still closes the connection', async () => {
    const client = fakeClient({ queryError: new Error('constraint violation') });
    const triggerFn = vi.fn();
    const result = await clearCoordinatorReview('SD-TEST-001', { createClientFn: async () => client, triggerFn });
    expect(result.cleared).toBe(false);
    expect(result.error).toMatch(/constraint violation/);
    expect(client.end).toHaveBeenCalledOnce();
    expect(triggerFn).not.toHaveBeenCalled();
  });

  it('closes the connection even when the query throws (finally-block guarantee)', async () => {
    const client = fakeClient({ queryError: new Error('boom') });
    await clearCoordinatorReview('SD-TEST-001', { createClientFn: async () => client, triggerFn: vi.fn() });
    expect(client.end).toHaveBeenCalledOnce();
  });
});

describe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: buildClearReviewQuery', () => {
  it('is a pure function returning the exact atomic-merge SQL/params', () => {
    const { sql, params } = buildClearReviewQuery('SD-ABC-001');
    expect(sql).toBe("UPDATE strategic_directives_v2 SET metadata = metadata || '{\"needs_coordinator_review\": false}'::jsonb WHERE sd_key = $1");
    expect(params).toEqual(['SD-ABC-001']);
  });
});
