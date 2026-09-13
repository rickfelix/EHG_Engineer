/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 -- unit tests for the ported Clerk session-token minter
 * (lib/apa/altifyai-uat-session-token.mjs, pinned to altifyai commit 130192b7fb84723c1b46c017f23cb79f93e62a2a).
 */
import { describe, it, expect, vi } from 'vitest';
import { mintUatSessionToken, RESERVED_UAT_USER_ID } from '../../../lib/apa/altifyai-uat-session-token.mjs';

const OK = (body) => ({ ok: true, json: async () => body });
const FAIL = (status) => ({ ok: false, status, json: async () => ({}) });

function happyPathFetch() {
  const calls = [];
  const fn = vi.fn(async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/testing_tokens')) return OK({ token: 'testing-tok' });
    if (url.includes('/sign_in_tokens')) return OK({ token: 'ticket-tok' });
    if (url.includes('/dev_browser')) return OK({ token: 'db-jwt' });
    if (url.includes('/client/sign_ins')) return OK({ client: { sessions: [{ last_active_token: { jwt: 'final-jwt' } }] } });
    throw new Error(`unexpected fetch: ${url}`);
  });
  fn.calls = calls;
  return fn;
}

describe('mintUatSessionToken', () => {
  const base = { secretKey: 'sk_test_abc123', deployedOrigin: 'https://altifyai.example.dev', fapiOrigin: 'https://neat-foxhound.clerk.accounts.dev' };

  it('validates required params', async () => {
    await expect(mintUatSessionToken({ ...base, secretKey: undefined, fetchImpl: happyPathFetch() })).rejects.toThrow(/secretKey is required/);
    await expect(mintUatSessionToken({ ...base, secretKey: 'not-a-test-key', fetchImpl: happyPathFetch() })).rejects.toThrow(/sk_test_/);
    await expect(mintUatSessionToken({ ...base, deployedOrigin: undefined, fetchImpl: happyPathFetch() })).rejects.toThrow(/deployedOrigin is required/);
    await expect(mintUatSessionToken({ ...base, fapiOrigin: undefined, fetchImpl: happyPathFetch() })).rejects.toThrow(/fapiOrigin is required/);
  });

  it('happy path: mints the reserved UAT identity a session JWT via the 4-step ticket flow', async () => {
    const fetchImpl = happyPathFetch();
    const jwt = await mintUatSessionToken({ ...base, fetchImpl });
    expect(jwt).toBe('final-jwt');
    expect(fetchImpl.calls).toHaveLength(4);
    // sign_in_tokens is minted for the reserved identity, not an arbitrary user
    const signInTokensCall = fetchImpl.calls.find((c) => c.url.includes('/sign_in_tokens'));
    expect(JSON.parse(signInTokensCall.opts.body).user_id).toBe(RESERVED_UAT_USER_ID);
    // the final sign_ins call carries the deployed origin so Clerk stamps azp correctly
    const signInsCall = fetchImpl.calls.find((c) => c.url.includes('/client/sign_ins'));
    expect(signInsCall.opts.headers.origin).toBe(base.deployedOrigin);
  });

  it('propagates a failure at each of the 4 steps distinctly', async () => {
    const failAt = (matchFragment) => vi.fn(async (url) => {
      if (url.includes(matchFragment)) return FAIL(401);
      if (url.includes('/testing_tokens')) return OK({ token: 't' });
      if (url.includes('/sign_in_tokens')) return OK({ token: 't' });
      if (url.includes('/dev_browser')) return OK({ token: 't' });
      return OK({ client: { sessions: [{ last_active_token: { jwt: 'x' } }] } });
    });
    await expect(mintUatSessionToken({ ...base, fetchImpl: failAt('/testing_tokens') })).rejects.toThrow(/testing_tokens request failed/);
    await expect(mintUatSessionToken({ ...base, fetchImpl: failAt('/sign_in_tokens') })).rejects.toThrow(/sign_in_tokens request failed/);
    await expect(mintUatSessionToken({ ...base, fetchImpl: failAt('/dev_browser') })).rejects.toThrow(/dev_browser request failed/);
    await expect(mintUatSessionToken({ ...base, fetchImpl: failAt('/client/sign_ins') })).rejects.toThrow(/sign_ins \(ticket strategy\) request failed/);
  });

  it('throws if the final response carries no session JWT', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/client/sign_ins')) return OK({ client: { sessions: [] } });
      if (url.includes('/testing_tokens')) return OK({ token: 't' });
      if (url.includes('/sign_in_tokens')) return OK({ token: 't' });
      return OK({ token: 't' });
    });
    await expect(mintUatSessionToken({ ...base, fetchImpl })).rejects.toThrow(/no session JWT/);
  });
});
