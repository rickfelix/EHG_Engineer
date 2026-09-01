/**
 * QF-20260901-117 — checkTestEvidenceFreshness must refuse reuse of evidence
 * whose computed age_minutes is negative (local-vs-UTC clock skew on the
 * write path), instead of treating a negative age as "very fresh".
 * Mocks @supabase/supabase-js so no real DB is required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const singleMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: singleMock })),
      })),
    })),
  })),
}));

let checkTestEvidenceFreshness;
beforeEach(async () => {
  singleMock.mockReset();
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  vi.resetModules();
  ({ checkTestEvidenceFreshness } = await import('../../scripts/lib/test-evidence-ingest.js'));
});

describe('checkTestEvidenceFreshness', () => {
  it('refuses reuse when age_minutes is negative (clock skew)', async () => {
    singleMock.mockResolvedValue({
      data: { age_minutes: -240, freshness_status: 'FRESH', passed_tests: 10, total_tests: 10 },
      error: null,
    });
    const result = await checkTestEvidenceFreshness('sd-1', 60);
    expect(result.isFresh).toBe(false);
    expect(result.reason).toMatch(/clock skew/);
  });

  it('still accepts genuinely fresh evidence with a non-negative age', async () => {
    singleMock.mockResolvedValue({
      data: { age_minutes: 5, freshness_status: 'FRESH', passed_tests: 10, total_tests: 10 },
      error: null,
    });
    const result = await checkTestEvidenceFreshness('sd-1', 60);
    expect(result.isFresh).toBe(true);
  });
});
