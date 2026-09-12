/**
 * Cloudflare Registrar adapter — thin, injectable, credential-hygienic.
 *
 * SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 FR-2.
 *
 * THIN by contract (mirrors lib/venture-deploy/cli-adapters.js): no business
 * logic here — search/check/register are 1:1 HTTP wrappers over the Cloudflare
 * Registrar API (beta 2026-04: /accounts/{id}/registrar domain-search + check +
 * register; capability confirmed at PLAN). All orchestration (approval matrix,
 * ceiling, idempotency) lives in acquire.js / decision-packet.js, which take
 * this adapter via dependency injection so tests pass fakes and no unit test
 * ever makes live HTTP.
 *
 * CREDENTIAL CONTRACT (TR-5): token read ONCE at construction from
 * CLOUDFLARE_REGISTRAR_API_TOKEN (Registrar write + DNS edit scopes,
 * least-privilege) + CLOUDFLARE_ACCOUNT_ID. The factory returns NULL when
 * either is absent — null adapter IS the plan-mode activation gate downstream
 * (blocked_on_credentials, zero live calls). The token value is captured in a
 * closure and never logged, echoed, thrown, or persisted; error messages carry
 * only sanitized registrar error text.
 *
 * PROVISIONING (chairman bootstrap step, NOT an EXEC blocker): create a CF API
 * token scoped to Registrar:Edit + DNS:Edit on the platform account, then set
 * both env vars in the platform secret store. Until then every consumer plans.
 *
 * @module lib/venture-acquisition/registrar-adapter
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Build the adapter, or null when credentials are absent (=> plan mode).
 *
 * @param {object} [env] - environment (injectable for tests)
 * @param {{fetchImpl?: typeof fetch}} [opts] - fetch seam for tests
 * @returns {{searchDomains: Function, checkDomain: Function, registerDomain: Function}|null}
 */
export function createRegistrarAdapter(env = process.env, { fetchImpl } = {}) {
  const token = env.CLOUDFLARE_REGISTRAR_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return null;
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  const base = `${API_BASE}/accounts/${encodeURIComponent(accountId)}/registrar`;

  /**
   * One HTTP call; throws a SANITIZED error (registrar text only, never the token).
   * `pathOrUrl` may be a registrar-relative path (prefixed with `base`) or an absolute
   * URL (used as-is) — the latter lets registerDomain follow a registration-status
   * poll link (`result.links.self`) without assuming it stays under `base`.
   *
   * QF-20260912-746: the thrown error now also carries `.registrarErrors` (the raw
   * `errors[]` array) and `.registrarStatus` (HTTP status) so a caller can surface the
   * registrar's real error code, not just a joined message string.
   */
  async function call(method, pathOrUrl, body) {
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${base}${pathOrUrl}`;
    const res = await f(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error body — status carries the signal */ }
    if (!res.ok || (json && json.success === false)) {
      const errs = json?.errors || [];
      const detail = errs.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
      const err = new Error(`registrar ${method} ${pathOrUrl}: ${detail}`);
      err.registrarErrors = errs;
      err.registrarStatus = res.status;
      throw err;
    }
    return json?.result ?? json;
  }

  /**
   * Register a domain via the DOCUMENTED Cloudflare Registrar "Create Registration"
   * operation (QF-20260912-746 — live-verified 2026-09-12T13:22:52Z: 201, result.state
   * succeeded on the real altifyai.app purchase). The previous implementation POSTed
   * `/domains/{domain}/register`, an undocumented path that returned error code 10000.
   *
   * Per the docs, registration can complete asynchronously — when `result.completed`
   * is `false`, `result.links.self` is a poll URL for the registration's status. This
   * polls that link (bounded by pollMaxAttempts/pollDelayMs, both overridable so tests
   * never need a real delay) until `completed` is true or the budget is exhausted, in
   * which case the last-seen (still-pending) result is returned rather than guessing.
   */
  async function registerDomain(domain, {
    years = 1,
    autoRenew = false,
    privacyMode = false,
    pollMaxAttempts = 5,
    pollDelayMs = 2000,
  } = {}) {
    let result = await call('POST', '/registrations', {
      domain_name: domain,
      years,
      auto_renew: autoRenew,
      privacy_mode: privacyMode,
    });
    let attempts = 0;
    while (result && result.completed === false && result?.links?.self && attempts < pollMaxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
      result = await call('GET', result.links.self);
      attempts += 1;
    }
    return result;
  }

  return {
    /** Candidate-domain search from a keyword/phrase. */
    searchDomains: (query) => call('POST', '/domain-search', { query }),
    /** Registrability + live price for one domain. Returns the raw API result. */
    checkDomain: (domain) => call('GET', `/domains/${encodeURIComponent(domain)}/check`),
    /** List domains already on this registrar account (FR-2 scope preflight). */
    listDomains: () => call('GET', '/domains'),
    /**
     * Read the account's billing profile (FR-2 scope preflight). Billing is account-
     * scoped, NOT under the registrar sub-path, so this passes an absolute URL rather
     * than a `base`-relative one — `call()` uses it as-is.
     */
    checkBillingProfile: () => call('GET', `${API_BASE}/accounts/${encodeURIComponent(accountId)}/billing/profile`),
    /** Register a domain. THE real-money call — acquire.js makes this the last, most-audited step. */
    registerDomain,
  };
}

/**
 * Normalize a checkDomain result to {registrable, priceUsd, currency} (unknown-safe).
 *
 * QF-20260912-744: the Cloudflare Registrar `check` endpoint returns the fee under
 * `fees.registration_fee`, not `price`/`price_usd`/`fees.registration` -- every live quote
 * came back priceUsd:null, ranking every domain 'unknown' and fail-closing the ceiling
 * guardrail even after chairman approval. `fees.registration_fee` is now read first (older
 * fallbacks kept for other adapters/fixtures). A non-USD `fees.currency` forces priceUsd to
 * null rather than silently comparing a foreign-currency amount against a USD ceiling.
 */
export function normalizeQuote(checkResult) {
  const registrable = checkResult?.available === true || checkResult?.registrable === true;
  const currency = checkResult?.fees?.currency ?? null;
  const isNonUsd = typeof currency === 'string' && currency.toUpperCase() !== 'USD';
  const raw = checkResult?.fees?.registration_fee ?? checkResult?.price ?? checkResult?.price_usd ?? checkResult?.fees?.registration;
  const priceUsd = !isNonUsd && typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  return { registrable, priceUsd, currency };
}

export default { createRegistrarAdapter, normalizeQuote };
