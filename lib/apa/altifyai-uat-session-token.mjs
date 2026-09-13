/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 FR-2.
 *
 * Ported from the altifyai repo's scripts/ci/mint-venture-uat-session-token.mjs, PINNED at
 * commit 130192b7fb84723c1b46c017f23cb79f93e62a2a (fetched via `gh api
 * repos/rickfelix/altifyai/contents/scripts/ci/mint-venture-uat-session-token.mjs` on
 * 2026-09-13). That script mints a FRESH signed-in session for the reserved chairman UAT
 * identity against the live deployed origin, via Clerk's documented non-browser sign-in
 * pattern (Testing Tokens + sign-in tokens, both Backend API) so the resulting JWT's `azp`
 * claim is the deployed origin itself.
 *
 * DRIFT WARNING (TR-1): this is a cross-repo port, not a shared import -- if altifyai's own
 * copy changes (e.g. a future Clerk API version bump), this copy will silently diverge. The
 * upstream copy exists BECAUSE OF a prior drift incident (QF-20260912-162's azp/ALLOWED_ORIGINS
 * breakage); re-pull from the pinned commit above if altifyai's auth flow changes.
 *
 * Kept pure/injectable (no env/process access in mintUatSessionToken itself), matching the
 * upstream file's own convention, so this is unit-testable without live network access.
 */

// Reserved chairman UAT test identity (codestreetlabs+altifyai-uat@gmail.com), provisioned
// under SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001. Not a secret -- a Clerk user id alone cannot
// mint a session without the sk_test_ secret key.
export const RESERVED_UAT_USER_ID = 'user_3IeSpR4jzqAEHFcFbXtp53w5o3T';

const BACKEND_API = 'https://api.clerk.com/v1';

/**
 * Extracts Clerk's structured error code + trace id from a failed FAPI response, so a bare
 * "HTTP 401" becomes actionable. Never throws itself -- an unparseable body just yields no
 * suffix.
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function fapiErrorSuffix(res) {
  const body = await res.json().catch(() => null);
  const code = body?.errors?.[0]?.code;
  const traceId = body?.clerk_trace_id;
  if (!code && !traceId) return '';
  return `${code ? ` (${code})` : ''}${traceId ? ` [trace ${traceId}]` : ''}`;
}

/**
 * @param {{fetchImpl: typeof fetch, secretKey: string, deployedOrigin: string, fapiOrigin: string, userId?: string}} params
 * @returns {Promise<string>} the minted session JWT
 */
export async function mintUatSessionToken({ fetchImpl, secretKey, deployedOrigin, fapiOrigin, userId = RESERVED_UAT_USER_ID }) {
  if (!secretKey) throw new Error('mintUatSessionToken: secretKey is required');
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('mintUatSessionToken: secretKey must be a development-instance sk_test_ key');
  }
  if (!deployedOrigin) throw new Error('mintUatSessionToken: deployedOrigin is required');
  if (!fapiOrigin) throw new Error('mintUatSessionToken: fapiOrigin is required');

  const backendHeaders = { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' };

  const testingTokenRes = await fetchImpl(`${BACKEND_API}/testing_tokens`, {
    method: 'POST',
    headers: backendHeaders,
  });
  if (!testingTokenRes.ok) {
    throw new Error(`mintUatSessionToken: testing_tokens request failed with HTTP ${testingTokenRes.status}`);
  }
  const { token: testingToken } = await testingTokenRes.json();
  if (!testingToken) throw new Error('mintUatSessionToken: testing_tokens response carried no token');

  const ticketRes = await fetchImpl(`${BACKEND_API}/sign_in_tokens`, {
    method: 'POST',
    headers: backendHeaders,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 60 }),
  });
  if (!ticketRes.ok) {
    throw new Error(`mintUatSessionToken: sign_in_tokens request failed with HTTP ${ticketRes.status}`);
  }
  const { token: ticket } = await ticketRes.json();
  if (!ticket) throw new Error('mintUatSessionToken: sign_in_tokens response carried no token');

  // On a Clerk DEVELOPMENT instance every Frontend API client call must carry a dev-browser JWT
  // (the __clerk_db_jwt query param); the testing token above bypasses bot detection but does
  // not replace this handshake.
  const devBrowserRes = await fetchImpl(`${fapiOrigin}/v1/dev_browser`, { method: 'POST' });
  if (!devBrowserRes.ok) {
    throw new Error(`mintUatSessionToken: dev_browser request failed with HTTP ${devBrowserRes.status}${await fapiErrorSuffix(devBrowserRes)}`);
  }
  const { token: dbJwt } = await devBrowserRes.json();
  if (!dbJwt) throw new Error('mintUatSessionToken: dev_browser response carried no token');

  const signInUrl = `${fapiOrigin}/v1/client/sign_ins?__clerk_testing_token=${encodeURIComponent(testingToken)}&__clerk_db_jwt=${encodeURIComponent(dbJwt)}`;
  const signInRes = await fetchImpl(signInUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: deployedOrigin },
    body: new URLSearchParams({ strategy: 'ticket', ticket }).toString(),
  });
  if (!signInRes.ok) {
    throw new Error(`mintUatSessionToken: sign_ins (ticket strategy) request failed with HTTP ${signInRes.status}${await fapiErrorSuffix(signInRes)}`);
  }
  const signInBody = await signInRes.json();
  const sessions = signInBody?.response?.client?.sessions ?? signInBody?.client?.sessions ?? [];
  const jwt = sessions[0]?.last_active_token?.jwt;
  if (!jwt) {
    throw new Error('mintUatSessionToken: sign_ins response carried no session JWT');
  }
  return jwt;
}
