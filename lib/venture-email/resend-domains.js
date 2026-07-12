/**
 * Resend domains adapter — enroll, verify-poll, per-domain scoped keys, capacity count.
 * SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001 FR-3.
 *
 * Canonical adapter contract (matches lib/venture-acquisition/registrar-adapter.js):
 * createResendDomainsAdapter(env, {fetchImpl}) returns the adapter, or **null when
 * RESEND_API_KEY is absent** — null adapter = plan-mode, never a throw.
 *
 * Hardened HTTP shape per lib/notifications/resend-adapter.js doctrine: per-request
 * timeout, bounded retries with backoff, 4xx classified non-retryable. The verify leg
 * deliberately does NOT route through resend-adapter.sendEmail (send-only + night
 * suppression 23:00–05:00 ET — unsuitable for provisioning).
 *
 * Resend Pro caps 10 domains: countDomains() feeds the FR-3 capacity warning at >= 8.
 */
import { ResendScopeError, VerifyPollTimeoutError } from './errors.js';

const API_BASE = 'https://api.resend.com';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

async function resendFetch(fetchImpl, apiKey, path, { method = 'GET', body } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${API_BASE}${path}`, {
        method,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, status: res.status, json };
      // 4xx: non-retryable — classify and return; 5xx: retry.
      if (res.status < 500) {
        if (res.status === 401 || res.status === 403) {
          throw new ResendScopeError(`Resend refused ${method} ${path} (${res.status}) — key lacks the required scope`);
        }
        return { ok: false, status: res.status, json };
      }
      lastErr = new Error(`Resend ${method} ${path} -> ${res.status}`);
    } catch (err) {
      if (err instanceof ResendScopeError) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastErr;
}

/**
 * @param {object} env - process-env-shaped object (RESEND_API_KEY read here)
 * @param {{fetchImpl?: typeof fetch, sleepMs?: (ms:number)=>Promise<void>}} [opts]
 * @returns adapter or null (plan-mode) when RESEND_API_KEY is absent
 */
export function createResendDomainsAdapter(env, { fetchImpl = fetch, sleepMs } = {}) {
  const apiKey = env && env.RESEND_API_KEY;
  if (!apiKey) return null;
  const sleep = sleepMs || ((ms) => new Promise((r) => setTimeout(r, ms)));

  return {
    /** Enroll the domain; idempotent-by-lookup (existing enrollment is reused, never duplicated). */
    async enrollDomain(domain) {
      const existing = await this.findDomain(domain);
      if (existing) return { reused: true, ...existing };
      const res = await resendFetch(fetchImpl, apiKey, '/domains', { method: 'POST', body: { name: domain } });
      if (!res.ok) throw new Error(`Resend domain enrollment failed for ${domain}: ${res.status} ${JSON.stringify(res.json)}`);
      return { reused: false, id: res.json.id, records: res.json.records || [], status: res.json.status };
    },

    async findDomain(domain) {
      const res = await resendFetch(fetchImpl, apiKey, '/domains');
      if (!res.ok) return null;
      const hit = (res.json.data || []).find((d) => d.name === domain);
      if (!hit) return null;
      const detail = await resendFetch(fetchImpl, apiKey, `/domains/${hit.id}`);
      return detail.ok ? { id: hit.id, records: detail.json.records || [], status: detail.json.status } : { id: hit.id, records: [], status: hit.status };
    },

    /**
     * Bounded verify-poll. Resumable by design: on exhaustion it throws
     * VerifyPollTimeoutError and the step machine keeps provision_state at the
     * last completed step so a later re-invocation resumes here.
     */
    async verifyDomain(domainId, { maxAttempts = 30, intervalMs = 30_000 } = {}) {
      await resendFetch(fetchImpl, apiKey, `/domains/${domainId}/verify`, { method: 'POST' });
      for (let i = 0; i < maxAttempts; i += 1) {
        const res = await resendFetch(fetchImpl, apiKey, `/domains/${domainId}`);
        if (res.ok && res.json.status === 'verified') return { verified: true, attempts: i + 1 };
        await sleep(intervalMs);
      }
      throw new VerifyPollTimeoutError(`domain ${domainId} not verified after ${maxAttempts} attempts`, { attempts: maxAttempts });
    },

    /**
     * Mint a per-domain scoped key (per-venture isolation + revocability, FR-3).
     * Resend reveals the key VALUE exactly once — the caller must route it to
     * venture_channel_secrets immediately (DATABASE condition C2); only the ID
     * lands in venture_email_identities.
     */
    async mintScopedKey(domain, domainId) {
      const res = await resendFetch(fetchImpl, apiKey, '/api-keys', {
        method: 'POST',
        body: { name: `venture-${domain}`, permission: 'sending_access', domain_id: domainId },
      });
      if (!res.ok) throw new Error(`Scoped key mint failed for ${domain}: ${res.status} ${JSON.stringify(res.json)}`);
      return { keyId: res.json.id, keyValue: res.json.token };
    },

    async countDomains() {
      const res = await resendFetch(fetchImpl, apiKey, '/domains');
      return res.ok ? (res.json.data || []).length : 0;
    },
  };
}
