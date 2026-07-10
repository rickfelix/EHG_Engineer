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

  /** One HTTP call; throws a SANITIZED error (registrar text only, never the token). */
  async function call(method, path, body) {
    const res = await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error body — status carries the signal */ }
    if (!res.ok || (json && json.success === false)) {
      const detail = json?.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
      throw new Error(`registrar ${method} ${path}: ${detail}`);
    }
    return json?.result ?? json;
  }

  return {
    /** Candidate-domain search from a keyword/phrase. */
    searchDomains: (query) => call('POST', '/domain-search', { query }),
    /** Registrability + live price for one domain. Returns the raw API result. */
    checkDomain: (domain) => call('GET', `/domains/${encodeURIComponent(domain)}/check`),
    /** Register a domain. THE real-money call — acquire.js makes this the last, most-audited step. */
    registerDomain: (domain, { years = 1, autoRenew = false } = {}) =>
      call('POST', `/domains/${encodeURIComponent(domain)}/register`, { years, auto_renew: autoRenew }),
  };
}

/** Normalize a checkDomain result to {registrable, priceUsd} (unknown-safe). */
export function normalizeQuote(checkResult) {
  const registrable = checkResult?.available === true || checkResult?.registrable === true;
  const raw = checkResult?.price ?? checkResult?.price_usd ?? checkResult?.fees?.registration;
  const priceUsd = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  return { registrable, priceUsd };
}

export default { createRegistrarAdapter, normalizeQuote };
