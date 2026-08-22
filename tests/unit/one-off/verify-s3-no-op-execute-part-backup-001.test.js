// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-1): S3 no-op verification.
import { describe, it, expect } from 'vitest';
import { classifyS3Result, verifyS3, S3_PINNED_IDS } from '../../../scripts/one-off/verify-s3-no-op-execute-part-backup-001.mjs';

describe('classifyS3Result (FR-1)', () => {
  it('confirms no-op when every pinned id reads decision_by=null', () => {
    const rows = S3_PINNED_IDS.map((id) => ({ id, decision_by: null }));
    const result = classifyS3Result(rows, S3_PINNED_IDS);
    expect(result.noOpConfirmed).toHaveLength(S3_PINNED_IDS.length);
    expect(result.clobbered).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it('flags a genuine anomaly loudly instead of silently absorbing it', () => {
    const rows = S3_PINNED_IDS.map((id, i) => ({ id, decision_by: i === 0 ? 'unexpected-value' : null }));
    const result = classifyS3Result(rows, S3_PINNED_IDS);
    expect(result.clobbered).toEqual([{ id: S3_PINNED_IDS[0], decision_by: 'unexpected-value' }]);
    expect(result.noOpConfirmed).toHaveLength(S3_PINNED_IDS.length - 1);
  });

  it('flags a pinned id missing from the live read-back (e.g. row deleted) rather than silently skipping it', () => {
    const rows = S3_PINNED_IDS.slice(1).map((id) => ({ id, decision_by: null }));
    const result = classifyS3Result(rows, S3_PINNED_IDS);
    expect(result.missing).toEqual([S3_PINNED_IDS[0]]);
    expect(result.noOpConfirmed).toHaveLength(S3_PINNED_IDS.length - 1);
  });

  it('the pinned id list has exactly 21 entries, matching the coordinator-supplied spec, with no duplicates', () => {
    expect(S3_PINNED_IDS).toHaveLength(21);
    expect(new Set(S3_PINNED_IDS).size).toBe(21);
  });
});

describe('verifyS3 (FR-1): TS read-only guarantee', () => {
  it('performs zero writes against a mock DB client wired to fail the test on any non-SELECT statement', async () => {
    const queries = [];
    const mockClient = {
      async query(sql, _params) {
        queries.push(sql);
        if (!/^\s*SELECT/i.test(sql)) {
          throw new Error(`SAFETY TEST FAILURE: a non-SELECT statement was attempted: ${sql}`);
        }
        return { rows: S3_PINNED_IDS.map((id) => ({ id, decision_by: null })) };
      },
    };
    const result = await verifyS3({ client: mockClient });
    expect(result.skipped).toBe(false);
    expect(result.noOpConfirmed).toHaveLength(S3_PINNED_IDS.length);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => /^\s*SELECT/i.test(q))).toBe(true);
  });

  it('when no client is supplied, performs zero DB calls and reports every id as missing (skipped, not silently PASS)', async () => {
    const result = await verifyS3({});
    expect(result.skipped).toBe(true);
    expect(result.noOpConfirmed).toHaveLength(0);
    expect(result.missing).toEqual(S3_PINNED_IDS);
  });
});
