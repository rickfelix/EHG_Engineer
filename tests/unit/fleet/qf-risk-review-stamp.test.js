/**
 * Unit tests for lib/fleet/qf-risk-review-stamp.cjs.
 * SD-LEO-FIX-SELF-CLAIM-PREDICATE-001 (Solomon ruling 6580bedb).
 */
import { describe, test, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  computeQfRiskContentHash,
  getRiskReviewStampFreshness,
  stampQfRiskReviewed,
} = require('../../../lib/fleet/qf-risk-review-stamp.cjs');

describe('computeQfRiskContentHash', () => {
  test('is deterministic for the same title+description', () => {
    const a = computeQfRiskContentHash({ title: 'x', description: 'y' });
    const b = computeQfRiskContentHash({ title: 'x', description: 'y' });
    expect(a).toBe(b);
  });

  test('changes when title OR description changes', () => {
    const base = computeQfRiskContentHash({ title: 'x', description: 'y' });
    expect(computeQfRiskContentHash({ title: 'x2', description: 'y' })).not.toBe(base);
    expect(computeQfRiskContentHash({ title: 'x', description: 'y2' })).not.toBe(base);
  });

  test('treats missing title/description as empty string, never throws', () => {
    expect(() => computeQfRiskContentHash({})).not.toThrow();
    expect(computeQfRiskContentHash({ title: undefined, description: undefined }))
      .toBe(computeQfRiskContentHash({ title: '', description: '' }));
  });
});

describe('getRiskReviewStampFreshness', () => {
  test('absent: no compliance_details at all', () => {
    expect(getRiskReviewStampFreshness({ title: 'a', description: 'b' })).toEqual({ status: 'absent', stamp: null });
  });

  test('absent: compliance_details present but no risk_reviewed key', () => {
    expect(getRiskReviewStampFreshness({ title: 'a', description: 'b', compliance_details: { totalScore: 90 } }))
      .toEqual({ status: 'absent', stamp: null });
  });

  test('absent: risk_reviewed present but missing content_hash', () => {
    const result = getRiskReviewStampFreshness({
      title: 'a', description: 'b',
      compliance_details: { risk_reviewed: { by: 'row-1', at: '2026-09-02T00:00:00Z' } },
    });
    expect(result.status).toBe('absent');
  });

  test('fresh: content_hash matches the CURRENT title+description', () => {
    const hash = computeQfRiskContentHash({ title: 'a', description: 'b' });
    const qf = { title: 'a', description: 'b', compliance_details: { risk_reviewed: { by: 'row-1', at: 'x', content_hash: hash } } };
    const result = getRiskReviewStampFreshness(qf);
    expect(result.status).toBe('fresh');
    expect(result.stamp.content_hash).toBe(hash);
  });

  test('stale: content_hash was computed against DIFFERENT text than the row now carries', () => {
    const hash = computeQfRiskContentHash({ title: 'a', description: 'b' });
    const qf = { title: 'a', description: 'b (amended after review)', compliance_details: { risk_reviewed: { by: 'row-1', at: 'x', content_hash: hash } } };
    expect(getRiskReviewStampFreshness(qf).status).toBe('stale');
  });
});

describe('stampQfRiskReviewed', () => {
  function mockSupabase({ existingComplianceDetails = null, readError = null, writeError = null } = {}) {
    const updateCalls = [];
    return {
      updateCalls,
      client: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                readError ? { data: null, error: readError } : { data: { compliance_details: existingComplianceDetails }, error: null }
              ),
            }),
          }),
          update: vi.fn().mockImplementation((row) => {
            updateCalls.push(row);
            return { eq: vi.fn().mockResolvedValue({ error: writeError }) };
          }),
        }),
      },
    };
  }

  test('requires subAgentRowId — refuses to write an unprovenanced stamp', async () => {
    const { client } = mockSupabase();
    const result = await stampQfRiskReviewed(client, 'qf-1', { title: 'a', description: 'b' });
    expect(result.ok).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  test('merges risk_reviewed into EXISTING compliance_details rather than clobbering it', async () => {
    const { client, updateCalls } = mockSupabase({ existingComplianceDetails: { totalScore: 88, verdict: 'PASS' } });
    const result = await stampQfRiskReviewed(client, 'qf-1', { subAgentRowId: 'sub-row-1', title: 'a', description: 'b' });
    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const written = updateCalls[0].compliance_details;
    expect(written.totalScore).toBe(88);
    expect(written.verdict).toBe('PASS');
    expect(written.risk_reviewed.by).toBe('sub-row-1');
    expect(written.risk_reviewed.content_hash).toBe(computeQfRiskContentHash({ title: 'a', description: 'b' }));
  });

  test('propagates a read error rather than writing blind', async () => {
    const { client } = mockSupabase({ readError: { message: 'boom' } });
    const result = await stampQfRiskReviewed(client, 'qf-1', { subAgentRowId: 'sub-row-1', title: 'a', description: 'b' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/boom/);
  });

  test('propagates a write error', async () => {
    const { client } = mockSupabase({ writeError: { message: 'write failed' } });
    const result = await stampQfRiskReviewed(client, 'qf-1', { subAgentRowId: 'sub-row-1', title: 'a', description: 'b' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/write failed/);
  });
});
