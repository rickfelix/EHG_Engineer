/**
 * QF-LEO-INFRA-VENTURE-JOURNEY-UAT-001-adjacent fix: lib/quality/priority-calculator.js
 * constructed its Supabase client at module scope (const supabase =
 * createSupabaseServiceClient()), so merely IMPORTING the file -- not calling anything in it
 * -- threw whenever Supabase env vars were absent. This was invisible to every existing
 * vitest suite (a green vitest run cannot see an import-time credential throw when a real
 * .env happens to be present locally); it was only caught by .github/workflows/worker-smoke.yml's
 * credential-free "barrel ESM static-link" check, after SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001's
 * own FR-4 change created a new transitive import path into this otherwise-unrelated file.
 *
 * These tests pin the fix (a lazy getSupabase() getter) directly: importing must never
 * construct a client, only actually calling a function that needs one may, and only once
 * (memoized) across repeated calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSupabaseServiceClient = vi.fn();

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: (...args) => createSupabaseServiceClient(...args),
}));

function makeFromMock() {
  const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return vi.fn(() => ({ select }));
}

describe('priority-calculator.js -- lazy Supabase client construction (regression)', () => {
  beforeEach(() => {
    vi.resetModules();
    createSupabaseServiceClient.mockReset();
  });

  it('importing the module does not construct a Supabase client', async () => {
    createSupabaseServiceClient.mockReturnValue({ from: vi.fn() });

    await import('../../../lib/quality/priority-calculator.js');

    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('calling a pure function (calculatePriority) still does not construct a client', async () => {
    createSupabaseServiceClient.mockReturnValue({ from: vi.fn() });
    const { calculatePriority } = await import('../../../lib/quality/priority-calculator.js');

    calculatePriority({ severity: 'high', type: 'issue', source_type: 'manual_feedback' });

    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it('calling updateFeedbackPriority constructs the client lazily, on first use', async () => {
    createSupabaseServiceClient.mockReturnValue({ from: makeFromMock() });
    const { updateFeedbackPriority } = await import('../../../lib/quality/priority-calculator.js');
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();

    await expect(updateFeedbackPriority('f1')).rejects.toThrow(/Failed to fetch feedback/);

    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1);
  });

  it('the client is memoized -- a second call does not construct a second client', async () => {
    createSupabaseServiceClient.mockReturnValue({ from: makeFromMock() });
    const { updateFeedbackPriority } = await import('../../../lib/quality/priority-calculator.js');

    await expect(updateFeedbackPriority('f1')).rejects.toThrow();
    await expect(updateFeedbackPriority('f2')).rejects.toThrow();

    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1);
  });
});
