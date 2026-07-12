/**
 * Cloudflare cost adapter — thin, injectable, credential-hygienic.
 *
 * SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1.
 *
 * THIN by contract (mirrors lib/venture-acquisition/registrar-adapter.js): no business
 * logic here — two 1:1 HTTP wrappers over Cloudflare's public APIs. All fail-soft /
 * unattested-vs-measured decisions live in the caller (scripts/operator/feed-venture-
 * operating-burn.mjs), which takes this adapter via dependency injection so unit tests
 * pass fakes and never make live HTTP.
 *
 * CREDENTIAL CONTRACT: token read ONCE at construction from CLOUDFLARE_API_TOKEN
 * (Account Analytics:Read scope) + CLOUDFLARE_ACCOUNT_ID. The factory returns NULL when
 * either is absent — null adapter IS the fail-soft/unattested activation gate downstream,
 * zero live calls. The token value is captured in a closure and never logged, echoed,
 * thrown, or persisted; error messages carry only sanitized Cloudflare error text.
 *
 * INFRA COST (readWorkersUsage): Cloudflare's GraphQL Analytics API returns USAGE COUNTS
 * ONLY (CPU-ms, requests) — never a dollar figure (Cloudflare's own docs warn against
 * using these datasets for billing). Converting to a cost estimate is the caller's job
 * (via lib/cost/cloudflare-pricing.js-style published-rate math), not this adapter's.
 *
 * AI COST (readAiGatewayCost): Cloudflare AI Gateway's REST Logs API
 * (GET /accounts/{account_id}/ai-gateway/gateways/{gateway_id}/logs) DOES return a
 * numeric `cost` field per log entry when the gateway proxies LLM calls. Requires a
 * gateway_id — until a venture's Worker actually routes LLM calls through a dedicated
 * AI Gateway, there is no gateway to query (a real, currently-true state for ApexNiche
 * AI, not an adapter defect).
 *
 * @module lib/operator/cloudflare-cost-adapter
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';
const GRAPHQL_ENDPOINT = `${API_BASE}/graphql`;

/**
 * Build the adapter, or null when credentials are absent (=> fail-soft/unattested).
 *
 * @param {object} [env] - environment (injectable for tests)
 * @param {{fetchImpl?: typeof fetch}} [opts] - fetch seam for tests
 * @returns {{readWorkersUsage: Function, readAiGatewayCost: Function}|null}
 */
export function createCloudflareCostAdapter(env = process.env, { fetchImpl } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return null;
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;

  async function call(method, path, body) {
    const res = await f(`${API_BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error body — status carries the signal */ }
    if (!res.ok || (json && json.success === false)) {
      const detail = json?.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
      throw new Error(`cloudflare ${method} ${path}: ${detail}`);
    }
    return json?.result ?? json;
  }

  async function graphql(query, variables) {
    const res = await f(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok || (json && Array.isArray(json.errors) && json.errors.length > 0)) {
      const detail = json?.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
      throw new Error(`cloudflare graphql: ${detail}`);
    }
    return json?.data ?? null;
  }

  return {
    /**
     * Workers/D1/R2 usage counts (requests, CPU-ms, rows, storage bytes) for the account
     * over a date range. Returns the raw GraphQL data shape — the caller converts to a
     * dollar estimate via published unit pricing. Never returns a cost figure itself.
     */
    readWorkersUsage: (startDate, endDate) => graphql(
      `query WorkersUsage($accountTag: String!, $start: Date!, $end: Date!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersInvocationsAdaptive(
              limit: 1000
              filter: { date_geq: $start, date_leq: $end }
            ) {
              sum { requests, errors, subrequests }
              dimensions { date }
            }
          }
        }
      }`,
      { accountTag: accountId, start: startDate, end: endDate },
    ),

    /**
     * AI Gateway per-log cost for a given gateway over a date range. Throws (fail-soft
     * caller responsibility) if gatewayId does not resolve to an existing gateway —
     * a "no gateway yet" 404 is the expected state until a venture's Worker is wired
     * to route LLM calls through Cloudflare AI Gateway.
     */
    readAiGatewayCost: (gatewayId, startDate, endDate) => call(
      'GET',
      `/accounts/${encodeURIComponent(accountId)}/ai-gateway/gateways/${encodeURIComponent(gatewayId)}/logs`
        + `?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
    ),
  };
}
