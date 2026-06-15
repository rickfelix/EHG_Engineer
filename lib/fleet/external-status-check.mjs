// SD-LEO-INFRA-AUTO-CHECK-EXTERNAL-001 — auto-check external Anthropic/Claude status on a fleet-wide anomaly
// BEFORE attributing it to a code or fleet gap.
//
// Real failure this prevents: a live Opus-4.8 incident caused mass rate-limits / heartbeat-loss that were
// nearly mis-attributed to a worker-resilience / fleet gap (D4 self-lesson; it also tripped this session's
// review workflows). When the fleet shows a cohort anomaly (see lib/fleet/freeze-detector.cjs), the coordinator
// /Adam should FIRST check whether Anthropic is having an incident, and only attribute to internal code/fleet
// if the external service is healthy.
//
// Split for testability:
//   - checkAnthropicStatus(): injectable-IO + FAIL-OPEN fetch of the Statuspage status.json. Never throws.
//   - classifyAnomalyAttribution(): PURE (data-in / verdict-out). The fail-open posture is load-bearing — a
//     fetch failure yields indicator='unknown' and a LOW-confidence "check manually" verdict, NEVER a confident
//     internal/external claim (so the guard against mis-attribution can itself never cause a mis-attribution).

// status.anthropic.com 302-redirects to status.claude.com; global fetch follows the redirect. (Verified
// reachable 2026-06-15: status.indicator='none', "All Systems Operational".)
export const DEFAULT_STATUS_URL = process.env.EXTERNAL_STATUS_URL || 'https://status.claude.com/api/v2/status.json';
export const DEFAULT_TIMEOUT_MS = Number(process.env.EXTERNAL_STATUS_TIMEOUT_MS) || 8000;

// Statuspage indicators that denote an ACTIVE incident (vs 'none' = operational).
export const INCIDENT_INDICATORS = new Set(['minor', 'major', 'critical']);

function failOpen(error) {
  return { ok: false, indicator: 'unknown', description: null, updatedAt: null, ageMs: null, error };
}

/**
 * Default IO seam — a node global-fetch GET with an AbortController timeout. Follows redirects.
 * Returns { ok:boolean, json:()=>Promise<any> }. Overridden in tests via opts.fetchImpl.
 */
async function defaultFetch(url, { timeoutMs } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: 'follow', headers: { 'User-Agent': 'leo-fleet-health/1.0 (+external-status-check)' } });
    return { ok: r.ok, json: () => r.json() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the external service status. INJECTABLE-IO + FAIL-OPEN — never throws.
 * @param {object} [opts]
 * @param {(url:string, o:object)=>Promise<{ok:boolean, json:()=>Promise<any>}>} [opts.fetchImpl] - IO seam (tests mock it)
 * @param {number} [opts.nowMs] - injected clock (for deterministic ageMs)
 * @param {string} [opts.url]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok:boolean, indicator:string, description:(string|null), updatedAt:(string|null), ageMs:(number|null), error:(string|null)}>}
 */
export async function checkAnthropicStatus({ fetchImpl, nowMs, url = DEFAULT_STATUS_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : defaultFetch;
  try {
    const res = await doFetch(url, { timeoutMs });
    if (!res || !res.ok) return failOpen('non-200 or empty response');
    const body = typeof res.json === 'function' ? await res.json() : res.body;
    const indicator = body && body.status && body.status.indicator;
    if (!indicator || typeof indicator !== 'string') return failOpen('no status.indicator in response body');
    const updatedAt = (body.page && body.page.updated_at) || null;
    // Guard an unparseable updated_at: new Date('garbage').getTime() is NaN → keep ageMs null (the JSDoc
    // promises number|null), so a downstream `ageMs > threshold` can never silently compare against NaN.
    const updatedTs = updatedAt ? new Date(updatedAt).getTime() : NaN;
    const ageMs = Number.isFinite(updatedTs) ? Math.max(0, now - updatedTs) : null;
    return { ok: true, indicator, description: (body.status && body.status.description) || null, updatedAt, ageMs, error: null };
  } catch (e) {
    return failOpen(e && e.message ? e.message : String(e));
  }
}

/**
 * Attribute a fleet-wide anomaly to a likely EXTERNAL incident vs an internal code/fleet gap. PURE.
 * @param {object} [p]
 * @param {object|string} [p.anomaly] - the fleet-anomaly summary (e.g. from freeze-detector)
 * @param {object} [p.status] - a checkAnthropicStatus() result
 * @returns {{likely_external:(boolean|null), indicator:string, confidence:('high'|'medium'|'low'), reason:string, recommendation:string}}
 */
export function classifyAnomalyAttribution({ anomaly, status } = {}) {
  const indicator = (status && typeof status.indicator === 'string') ? status.indicator : 'unknown';
  const anomalyDesc = (anomaly && (anomaly.summary || anomaly.kind)) || (typeof anomaly === 'string' && anomaly) || 'this fleet-wide anomaly';

  // FAIL-OPEN: status unreachable → never make a confident claim; recommend a manual check.
  if (indicator === 'unknown') {
    return {
      likely_external: null,
      indicator,
      confidence: 'low',
      reason: `Could not determine external status (${(status && status.error) || 'no status result'}).`,
      recommendation: `Check https://status.claude.com MANUALLY before attributing ${anomalyDesc} to a code/fleet gap — the external status could not be read, so neither cause can be ruled out.`,
    };
  }

  if (INCIDENT_INDICATORS.has(indicator)) {
    const desc = (status && status.description) ? `: ${status.description}` : '';
    return {
      likely_external: true,
      indicator,
      confidence: (indicator === 'major' || indicator === 'critical') ? 'high' : 'medium',
      reason: `Anthropic/Claude status reports an ACTIVE incident (indicator='${indicator}'${desc}).`,
      recommendation: `Treat ${anomalyDesc} as likely EXTERNAL — wait/retry per the incident. Do NOT attribute it to a code/fleet gap or file a remediation SD until the external status clears.`,
    };
  }

  if (indicator === 'none') {
    return {
      likely_external: false,
      indicator,
      confidence: 'medium',
      reason: `Anthropic/Claude status is operational (indicator='none').`,
      recommendation: `No known external incident — investigate ${anomalyDesc} as a possible code/fleet gap.`,
    };
  }

  // UNRECOGNIZED indicator (not none/minor/major/critical, and not the 'unknown' fetch-failure sentinel — e.g.
  // a 'maintenance' or future Statuspage value). It is NOT provably operational, so — true to the SD's
  // anti-mis-attribution mission — do NOT confidently steer to an internal investigation; treat it like unknown.
  return {
    likely_external: null,
    indicator,
    confidence: 'low',
    reason: `Unrecognized external status indicator '${indicator}'.`,
    recommendation: `Check https://status.claude.com MANUALLY before attributing ${anomalyDesc} — the status indicator was not recognized, so neither an external incident nor a code/fleet gap can be ruled out.`,
  };
}
