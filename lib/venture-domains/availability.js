/**
 * Domain-availability adapter — the read-only half of venture domain automation.
 *
 * SD-LEO-FEAT-VENTURE-DOMAIN-AVAILABILITY-001 (FR-1).
 *
 * Pure, injectable, mirroring the lib/venture-deploy adapter discipline: all I/O
 * (fetch), time (now) and pacing (sleep) are injected so tests run with fakes and
 * plan/test-mode never touches the network. Verdicts are HONEST (honest-gauge
 * convention): a lookup that cannot be confirmed is 'unknown' — a network fault,
 * timeout, rate-limit or exhausted budget is NEVER coerced to 'available'.
 *
 * RDAP (RFC 7480) is free and unauthenticated; https://rdap.org is the bootstrap
 * redirector covering gTLDs: 404 = unregistered (available), 2xx = registered
 * (taken), anything else = unknown.
 *
 * @module lib/venture-domains/availability
 */

export const DEFAULT_TLDS = Object.freeze(['.com', '.io', '.app', '.ai']);
export const DEFAULT_PREFIXES = Object.freeze(['get', 'try']);
export const MAX_PERMUTATIONS = 24;
export const RDAP_BASE = 'https://rdap.org/domain/';
export const VERDICTS = Object.freeze(['available', 'taken', 'unknown']);

/** Slugify a name candidate into a DNS label (lowercase alnum + hyphen). */
export function toLabel(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Generate sane domain permutations for a name candidate: exact, prefixed
 * (get-/try-), and hyphenated (word-split) labels across the TLD set.
 * Pure; deduped; capped at MAX_PERMUTATIONS (exact-first ordering so the cap
 * never drops the highest-signal domains).
 */
export function generatePermutations(name, { tlds = DEFAULT_TLDS, prefixes = DEFAULT_PREFIXES, hyphenate = true } = {}) {
  const hyphenated = toLabel(name); // word boundaries become hyphens
  const compact = hyphenated.replace(/-/g, '');
  if (!compact) return [];
  const labels = [compact];
  if (hyphenate && hyphenated !== compact) labels.push(hyphenated);
  for (const p of prefixes) labels.push(`${p}${compact}`);
  const out = [];
  const seen = new Set();
  // exact (unprefixed) labels first across all TLDs, then prefixed — cap keeps the best.
  for (const label of labels) {
    for (const tld of tlds) {
      const domain = `${label}${tld.startsWith('.') ? tld : `.${tld}`}`;
      if (!seen.has(domain)) { seen.add(domain); out.push(domain); }
      if (out.length >= MAX_PERMUTATIONS) return out;
    }
  }
  return out;
}

/** Create a rate budget: at most maxLookups, spaced minIntervalMs apart (injected clock/sleep). */
export function createRateBudget({ maxLookups = 20, minIntervalMs = 250, now = () => Date.now(), sleep = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  let used = 0;
  let lastAt = null; // first lookup is never paced
  return {
    get remaining() { return maxLookups - used; },
    exhausted() { return used >= maxLookups; },
    /** Consume one lookup slot, pacing if needed. Returns false when exhausted. */
    async take() {
      if (used >= maxLookups) return false;
      const wait = lastAt === null ? 0 : lastAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      used += 1;
      lastAt = now();
      return true;
    },
  };
}

/**
 * Check one domain via RDAP. NEVER throws; never a false 'available'.
 *
 * @returns {Promise<{domain, verdict: 'available'|'taken'|'unknown', reason?: string, source: 'rdap', checked_at: string}>}
 */
export async function checkDomainAvailability(domain, { fetch, now = () => new Date(), timeoutMs = 8000, rdapBase = RDAP_BASE } = {}) {
  const checked_at = now().toISOString();
  if (typeof fetch !== 'function') {
    return { domain, verdict: 'unknown', reason: 'no_fetch_injected', source: 'rdap', checked_at };
  }
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetch(`${rdapBase}${encodeURIComponent(domain)}`, {
        headers: { accept: 'application/rdap+json' },
        ...(ctl ? { signal: ctl.signal } : {}),
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 404) return { domain, verdict: 'available', source: 'rdap', checked_at };
    if (res.status >= 200 && res.status < 300) return { domain, verdict: 'taken', source: 'rdap', checked_at };
    return { domain, verdict: 'unknown', reason: `rdap_status_${res.status}`, source: 'rdap', checked_at };
  } catch (e) {
    return { domain, verdict: 'unknown', reason: `fetch_failed: ${String(e?.message || e).slice(0, 120)}`, source: 'rdap', checked_at };
  }
}

/**
 * Check a full candidate name: permutations under a shared rate budget.
 * Budget-exhausted permutations report unknown('budget_exhausted') — honest, never skipped silently.
 *
 * @returns {Promise<{candidate, results: object[], best: {domain, verdict}|null}>}
 */
export async function checkCandidateAvailability(name, { fetch, now = () => new Date(), budget, tlds, prefixes, hyphenate } = {}) {
  const domains = generatePermutations(name, { ...(tlds ? { tlds } : {}), ...(prefixes ? { prefixes } : {}), ...(hyphenate === undefined ? {} : { hyphenate }) });
  const b = budget || createRateBudget({ now: () => now().getTime() });
  const results = [];
  for (const domain of domains) {
    if (await b.take()) {
      results.push(await checkDomainAvailability(domain, { fetch, now }));
    } else {
      results.push({ domain, verdict: 'unknown', reason: 'budget_exhausted', source: 'rdap', checked_at: now().toISOString() });
    }
  }
  // best = first available in permutation order (exact-first), else null
  const best = results.find(r => r.verdict === 'available') || null;
  return { candidate: name, results, best: best ? { domain: best.domain, verdict: best.verdict } : null };
}

export default { toLabel, generatePermutations, createRateBudget, checkDomainAvailability, checkCandidateAvailability, DEFAULT_TLDS, DEFAULT_PREFIXES, MAX_PERMUTATIONS, VERDICTS };
