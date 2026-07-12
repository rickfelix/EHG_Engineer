/**
 * Cloudflare Email Routing adapter — hello@/support@ → central inbox.
 * SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001 FR-4.
 *
 * Canonical adapter contract: createEmailRoutingAdapter(env, {fetchImpl}) returns the
 * adapter or **null when CF_EMAIL_ROUTING_TOKEN / CLOUDFLARE_ACCOUNT_ID /
 * VENTURE_EMAIL_CENTRAL_INBOX are absent** → plan-mode, never a throw.
 *
 * Destination-address verification happens ONCE per central inbox and is reused across
 * ventures (Solomon adjudication); ensureDestination is idempotent-by-lookup, as are
 * the per-domain routing rules.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

async function cfFetch(fetchImpl, token, url, { method = 'GET', body } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success !== false) return { ok: true, status: res.status, json };
      if (res.status < 500) return { ok: false, status: res.status, json };
      lastErr = new Error(`CF ${method} ${url} -> ${res.status}`);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastErr;
}

const API = 'https://api.cloudflare.com/client/v4';

/**
 * @param {object} env - CF_EMAIL_ROUTING_TOKEN, CLOUDFLARE_ACCOUNT_ID, VENTURE_EMAIL_CENTRAL_INBOX
 * @param {{fetchImpl?: typeof fetch}} [opts]
 * @returns adapter or null (plan-mode)
 */
export function createEmailRoutingAdapter(env, { fetchImpl = fetch } = {}) {
  const token = env && env.CF_EMAIL_ROUTING_TOKEN;
  const accountId = env && env.CLOUDFLARE_ACCOUNT_ID;
  const centralInbox = env && env.VENTURE_EMAIL_CENTRAL_INBOX;
  if (!token || !accountId || !centralInbox) return null;

  return {
    centralInbox,

    /** Verify the central destination once; reused across ventures. Idempotent-by-lookup. */
    async ensureDestination() {
      const list = await cfFetch(fetchImpl, token, `${API}/accounts/${accountId}/email/routing/addresses`);
      const existing = list.ok ? (list.json.result || []).find((a) => a.email === centralInbox) : null;
      if (existing) return { reused: true, verified: !!existing.verified, id: existing.id };
      const created = await cfFetch(fetchImpl, token, `${API}/accounts/${accountId}/email/routing/addresses`, {
        method: 'POST', body: { email: centralInbox },
      });
      if (!created.ok) throw new Error(`CF destination create failed: ${created.status} ${JSON.stringify(created.json)}`);
      return { reused: false, verified: false, id: created.json.result?.id };
    },

    /** Create hello@/support@ → central rules on the zone. Idempotent-by-lookup per rule. */
    async ensureRoutes(zoneId, domain) {
      const wanted = [`hello@${domain}`, `support@${domain}`];
      const list = await cfFetch(fetchImpl, token, `${API}/zones/${zoneId}/email/routing/rules`);
      const existingTo = new Set(
        (list.ok ? list.json.result || [] : [])
          .flatMap((r) => (r.matchers || []).map((m) => m.value)),
      );
      const routes = [];
      for (const address of wanted) {
        if (existingTo.has(address)) {
          routes.push({ address, reused: true });
          continue;
        }
        const res = await cfFetch(fetchImpl, token, `${API}/zones/${zoneId}/email/routing/rules`, {
          method: 'POST',
          body: {
            name: `venture route ${address}`,
            enabled: true,
            matchers: [{ type: 'literal', field: 'to', value: address }],
            actions: [{ type: 'forward', value: [centralInbox] }],
          },
        });
        if (!res.ok) throw new Error(`CF route create failed for ${address}: ${res.status} ${JSON.stringify(res.json)}`);
        routes.push({ address, reused: false, id: res.json.result?.id });
      }
      return routes;
    },
  };
}
