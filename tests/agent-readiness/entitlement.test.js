import { describe, it, expect, vi, beforeEach } from 'vitest';

// Covers hasEntitlement()'s pagination logic — flagged by a second adversarial review pass on
// PR #7113 as the one of three fixes that shipped with zero test coverage. No live Stripe calls;
// checkout.sessions.list is fully mocked so pagination/matching/bound behavior can be asserted
// deterministically.

const listMock = vi.fn();
vi.mock('../../lib/payments/stripe-client.js', () => ({
  getStripe: async () => ({ checkout: { sessions: { list: (...args) => listMock(...args) } } })
}));

const { hasEntitlement } = await import('../../lib/agent-readiness/entitlement.js');

function page(sessions, hasMore) {
  return { data: sessions, has_more: hasMore };
}
function session(id, ventureUrl, paid = true) {
  return { id, payment_status: paid ? 'paid' : 'unpaid', metadata: { ventureUrl } };
}

beforeEach(() => {
  listMock.mockReset();
});

describe('hasEntitlement — pagination', () => {
  it('finds a match on the first page without paginating further', async () => {
    listMock.mockResolvedValueOnce(page([session('s1', 'https://x.invalid')], true));
    const result = await hasEntitlement('https://x.invalid');
    expect(result).toBe(true);
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledWith({ limit: 100, starting_after: undefined });
  });

  it('paginates via starting_after and finds a match on a later page', async () => {
    listMock
      .mockResolvedValueOnce(page([session('s1', 'https://other.invalid')], true))
      .mockResolvedValueOnce(page([session('s2', 'https://other2.invalid')], true))
      .mockResolvedValueOnce(page([session('s3', 'https://x.invalid')], true));
    const result = await hasEntitlement('https://x.invalid');
    expect(result).toBe(true);
    expect(listMock).toHaveBeenCalledTimes(3);
    expect(listMock.mock.calls[1][0]).toEqual({ limit: 100, starting_after: 's1' });
    expect(listMock.mock.calls[2][0]).toEqual({ limit: 100, starting_after: 's2' });
  });

  it('returns false once has_more is false and no match was found', async () => {
    listMock.mockResolvedValueOnce(page([session('s1', 'https://other.invalid')], false));
    const result = await hasEntitlement('https://x.invalid');
    expect(result).toBe(false);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('an unpaid session for the right ventureUrl does not count as entitled', async () => {
    listMock.mockResolvedValueOnce(page([session('s1', 'https://x.invalid', false)], false));
    const result = await hasEntitlement('https://x.invalid');
    expect(result).toBe(false);
  });

  it('is bounded at MAX_PAGES (10) even if has_more never turns false', async () => {
    listMock.mockImplementation(() => Promise.resolve(page([session('s', 'https://never-matches.invalid')], true)));
    const result = await hasEntitlement('https://x.invalid');
    expect(result).toBe(false);
    expect(listMock).toHaveBeenCalledTimes(10);
  });

  it('stops immediately on an empty page even if has_more claims true (defensive against a malformed API response)', async () => {
    listMock.mockResolvedValueOnce(page([], true));
    const result = await hasEntitlement('https://x.invalid');
    expect(result).toBe(false);
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});
