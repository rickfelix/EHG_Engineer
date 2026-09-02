import { describe, it, expect, vi } from 'vitest';

// QF-20260901-117: checkTestEvidenceFreshness must refuse reuse when age_minutes is
// negative (local-vs-UTC clock skew on the write path), rather than treating it as fresh.
let mockEvidence = null;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockEvidence, error: null }),
        }),
      }),
    }),
  })),
}));

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { checkTestEvidenceFreshness } = await import('./test-evidence-ingest.js');

describe('checkTestEvidenceFreshness clock-skew refusal (QF-20260901-117)', () => {
  it('refuses reuse when age_minutes is negative, even if freshness_status says FRESH', async () => {
    mockEvidence = { age_minutes: -240, freshness_status: 'FRESH', verdict: 'PASS' };
    const result = await checkTestEvidenceFreshness('sd-1', 60);
    expect(result.isFresh).toBe(false);
    expect(result.ageMinutes).toBe(-240);
    expect(result.reason).toMatch(/clock skew/i);
  });

  it('still accepts genuinely fresh, non-negative evidence within maxAgeMinutes', async () => {
    mockEvidence = { age_minutes: 15, freshness_status: 'FRESH', verdict: 'PASS' };
    const result = await checkTestEvidenceFreshness('sd-1', 60);
    expect(result.isFresh).toBe(true);
  });

  it('still rejects genuinely stale (positive, over-threshold) evidence', async () => {
    mockEvidence = { age_minutes: 120, freshness_status: 'STALE', verdict: 'PASS' };
    const result = await checkTestEvidenceFreshness('sd-1', 60);
    expect(result.isFresh).toBe(false);
  });
});
