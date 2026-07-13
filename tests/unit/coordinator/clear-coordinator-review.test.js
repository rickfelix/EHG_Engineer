/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-2): lib/coordinator/clear-coordinator-review.js
 *
 * The FIRST canonical write-site for metadata.needs_coordinator_review. Covers: the atomic
 * merge query shape (no read-spread-write), that a successful clear triggers a rank pass
 * (and a failed/no-op clear does NOT), and fail-soft behavior on connection/query errors.
 *
 * SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001 (TS-4/TS-5): the atomic UPDATE now ALSO guards on
 * metadata.lead_blocker NOT being active, so a still-lead_blocker-active SD can never have its
 * needs_coordinator_review cleared out from under it. On a 0-row UPDATE result, a follow-up
 * existence-only SELECT (which does NOT reintroduce a decision-relevant race -- the atomic UPDATE
 * already made the only real decision) disambiguates 'refused_lead_blocker_active' from
 * 'no_matching_row'.
 */
import { describe, it, expect, vi } from 'vitest';
import { clearCoordinatorReview, buildClearReviewQuery } from '../../../lib/coordinator/clear-coordinator-review.js';

/**
 * fakeClient — supports two distinct call shapes exercised by clearCoordinatorReview:
 *   1. the atomic UPDATE (returns { rowCount })
 *   2. the follow-up disambiguation SELECT, only run when the UPDATE's rowCount is 0
 *      (returns { rows: [...] })
 * `existsForSelect` controls what the follow-up SELECT reports when it runs.
 */
function fakeClient({ updateRowCount = 1, queryError = null, existsForSelect = false } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (queryError) throw queryError;
      if (/^\s*UPDATE/i.test(sql)) return { rowCount: updateRowCount };
      if (/^\s*SELECT/i.test(sql)) return { rows: existsForSelect ? [{ '?column?': 1 }] : [] };
      throw new Error(`fakeClient: unexpected query shape: ${sql}`);
    }),
    end: vi.fn(async () => {}),
  };
}

describe('SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: clearCoordinatorReview', () => {
  it('throws synchronously on a missing sdKey (programmer error, not a fail-soft path)', async () => {
    await expect(clearCoordinatorReview()).rejects.toThrow('sdKey is required');
  });

  it('issues ONE atomic || merge (not a read-then-full-write) and closes the connection on success', async () => {
    const client = fakeClient({ updateRowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const triggerFn = vi.fn();

    const result = await clearCoordinatorReview('SD-TEST-001', { createClientFn, triggerFn });

    expect(result).toEqual({ cleared: true, sdKey: 'SD-TEST-001' });
    expect(client.queries).toHaveLength(1); // no follow-up SELECT on the success path
    expect(client.queries[0].sql).toMatch(/\|\|/);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE/i);
    expect(client.queries[0].params).toEqual(['SD-TEST-001']);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('uses a service-role client via createDatabaseClient(\'engineer\', ...), matching the ranker\'s convention', async () => {
    const client = fakeClient({ updateRowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    await clearCoordinatorReview('SD-TEST-001', { createClientFn, triggerFn: vi.fn() });
    expect(createClientFn).toHaveBeenCalledWith('engineer', { verify: false });
  });

  it('triggers a rank pass ONLY after a successful clear', async () => {
    const client = fakeClient({ updateRowCount: 1 });
    const triggerFn = vi.fn();
    await clearCoordinatorReview('SD-TEST-001', { createClientFn: async () => client, triggerFn });
    expect(triggerFn).toHaveBeenCalledWith({ reason: 'clear_coordinator_review', sdKey: 'SD-TEST-001' });
  });

  it('does NOT trigger a rank pass when no row matched (sdKey not found)', async () => {
    const client = fakeClient({ updateRowCount: 0, existsForSelect: false });
    const triggerFn = vi.fn();
    const result = await clearCoordinatorReview('SD-DOES-NOT-EXIST', { createClientFn: async () => client, triggerFn });
    expect(result).toEqual({ cleared: false, sdKey: 'SD-DOES-NOT-EXIST', error: 'no_matching_row' });
    expect(triggerFn).not.toHaveBeenCalled();
  });

  it('TS-4: refuses the clear and disambiguates the reason when the row exists but lead_blocker is active', async () => {
    const client = fakeClient({ updateRowCount: 0, existsForSelect: true });
    const triggerFn = vi.fn();
    const result = await clearCoordinatorReview('SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-G1', { createClientFn: async () => client, triggerFn });
    expect(result).toEqual({ cleared: false, sdKey: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-G1', error: 'refused_lead_blocker_active' });
    expect(triggerFn).not.toHaveBeenCalled();
    expect(client.queries).toHaveLength(2); // the atomic UPDATE, then the disambiguation SELECT
  });

  it('TS-5: clears successfully when lead_blocker is absent (byte-identical happy path)', async () => {
    const client = fakeClient({ updateRowCount: 1 });
    const triggerFn = vi.fn();
    const result = await clearCoordinatorReview('SD-TEST-002', { createClientFn: async () => client, triggerFn });
    expect(result).toEqual({ cleared: true, sdKey: 'SD-TEST-002' });
    expect(triggerFn).toHaveBeenCalledOnce();
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
  it('is a pure function returning the atomic-merge SQL/params, guarded on lead_blocker', () => {
    const { sql, params } = buildClearReviewQuery('SD-ABC-001');
    expect(sql).toMatch(/^\s*UPDATE strategic_directives_v2/);
    expect(sql).toMatch(/SET metadata = COALESCE\(metadata,\s*'\{\}'::jsonb\)\s*\|\|\s*'\{"needs_coordinator_review":\s*false\}'::jsonb/);
    expect(sql).toMatch(/WHERE sd_key = \$1/);
    expect(params).toEqual(['SD-ABC-001']);
  });

  it('guards against NULL metadata via COALESCE (Postgres NULL || jsonb = NULL, verified live in adversarial review)', () => {
    const { sql } = buildClearReviewQuery('SD-ABC-001');
    expect(sql).toMatch(/COALESCE\(metadata,\s*'\{\}'::jsonb\)\s*\|\|/);
  });

  it('SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: WHERE clause allows the clear when lead_blocker is absent/null/false/empty-string', () => {
    const { sql } = buildClearReviewQuery('SD-ABC-001');
    expect(sql).toMatch(/metadata->'lead_blocker'\s+IS\s+NULL/i);
    // TESTING sub-agent (EXEC phase) found the SQL/JS truthiness matrices diverged on an EXPLICIT
    // JSON null value ({"lead_blocker": null}): Postgres `->` returns a JSON-null (not SQL-NULL)
    // for a present-but-null key, so `IS NULL` alone doesn't catch it -- an explicit '= null::jsonb'
    // check is required to match isLeadBlockerActive(null) === false (inactive) exactly.
    expect(sql).toMatch(/metadata->'lead_blocker'\s*=\s*'null'::jsonb/i);
    expect(sql).toMatch(/metadata->'lead_blocker'\s*=\s*'false'::jsonb/i);
    expect(sql).toMatch(/jsonb_typeof\(metadata->'lead_blocker'\)\s*=\s*'string'/i);
  });
});
