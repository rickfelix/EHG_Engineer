/**
 * Stage-11 naming integration for the domain-availability adapter.
 *
 * SD-LEO-FEAT-VENTURE-DOMAIN-AVAILABILITY-001 (FR-2/FR-3).
 *
 * ACTIVATION SEAM, default OFF: resolveAvailabilityChecker() returns null unless
 * DOMAIN_AVAILABILITY_MODE==='live' (or a checker is injected by the caller), so
 * the stage's default behavior — availabilityChecks.domain 'pending', no
 * Availability criterion, hardcoded 'unknown' naming rows — is byte-identical to
 * pre-SD behavior. When active, candidates gain an Availability score/criterion,
 * the decision carries real verdicts, and a decision-ready domainShortlist rides
 * the existing identity_brand_name artifact.
 *
 * @module lib/venture-domains/stage-integration
 */

import { checkCandidateAvailability, createRateBudget } from './availability.js';

export const DEFAULT_AVAILABILITY_WEIGHT = 15;

/** Env-gated checker factory: null (seam off) unless DOMAIN_AVAILABILITY_MODE=live. */
export function resolveAvailabilityChecker(env = process.env) {
  if (env.DOMAIN_AVAILABILITY_MODE !== 'live') return null;
  if (typeof fetch !== 'function') return null; // no global fetch — cannot go live
  const tlds = env.DOMAIN_AVAILABILITY_TLDS
    ? env.DOMAIN_AVAILABILITY_TLDS.split(',').map(t => t.trim()).filter(Boolean)
    : undefined;
  const budget = createRateBudget({});
  return (name) => checkCandidateAvailability(name, { fetch, budget, ...(tlds ? { tlds } : {}) });
}

export function resolveAvailabilityWeight(env = process.env) {
  const w = Number(env.DOMAIN_AVAILABILITY_WEIGHT);
  return Number.isFinite(w) && w > 0 && w < 100 ? w : DEFAULT_AVAILABILITY_WEIGHT;
}

/**
 * Run the checker across candidate names. Never throws; a checker fault yields
 * an empty result set for that candidate (downstream treats it as unknown).
 *
 * @param {string[]} names
 * @param {(name: string) => Promise<{candidate, results, best}>} checker
 * @returns {Promise<Map<string, {results: object[], best: object|null}>>}
 */
export async function assessCandidateAvailability(names, checker) {
  const byCandidate = new Map();
  for (const name of names) {
    try {
      const r = await checker(name);
      byCandidate.set(name, { results: r.results || [], best: r.best || null });
    } catch (e) {
      byCandidate.set(name, { results: [], best: null, error: String(e?.message || e).slice(0, 120) });
    }
  }
  return byCandidate;
}

/**
 * Score a candidate's availability 0-100 (honest: unknown-heavy = mid-low, never a
 * free pass): exact-first available permutation = 100; any available = 70;
 * all-known-taken = 0; otherwise (unknowns, no available) = 40.
 */
export function availabilityScore(assessment) {
  const results = assessment?.results || [];
  if (results.length === 0) return 40; // nothing confirmable — neutral-low, not zero, not perfect
  if (results[0]?.verdict === 'available') return 100; // exact permutation open
  if (results.some(r => r.verdict === 'available')) return 70;
  if (results.every(r => r.verdict === 'taken')) return 0;
  return 40;
}

/** Add the Availability criterion and rescale ALL weights to sum 100 (integer-safe). */
export function addAvailabilityCriterion(scoringCriteria, weight = DEFAULT_AVAILABILITY_WEIGHT) {
  const others = scoringCriteria.filter(c => c.name !== 'Availability');
  const otherSum = others.reduce((s, c) => s + (Number(c.weight) || 0), 0) || 1;
  const scale = (100 - weight) / otherSum;
  const rescaled = others.map(c => ({ ...c, weight: Math.round((Number(c.weight) || 0) * scale) }));
  const drift = 100 - weight - rescaled.reduce((s, c) => s + c.weight, 0);
  if (rescaled.length > 0) rescaled[0] = { ...rescaled[0], weight: rescaled[0].weight + drift };
  return [...rescaled, { name: 'Availability', weight, description: 'Domain availability across the configured TLD set (RDAP-verified; taken names lose rank)' }];
}

/** The selected candidate's domain verdict for decision.availabilityChecks.domain (string contract preserved). */
export function domainVerdictFor(assessment) {
  const results = assessment?.results || [];
  if (results.length === 0) return 'unknown';
  if (results.some(r => r.verdict === 'available')) return 'available';
  if (results.every(r => r.verdict === 'taken')) return 'taken';
  return 'unknown';
}

/** Detail sibling for the decision (checked_at + permutations tried) — additive, string contract untouched. */
export function domainDetailFor(assessment) {
  const results = assessment?.results || [];
  return {
    checked_at: results[0]?.checked_at || null,
    permutations: results.map(r => ({ domain: r.domain, verdict: r.verdict })),
  };
}

/**
 * Per-TLD status for the naming_suggestions columns. generatePermutations emits the
 * exact (unprefixed, unhyphenated) label FIRST for every TLD, so the first result per
 * TLD is the exact domain's verdict; honest 'unknown' fallback when unchecked.
 */
export function tldStatusesFor(assessment, tlds = ['.com', '.io', '.ai']) {
  const results = assessment?.results || [];
  const out = {};
  for (const tld of tlds) {
    out[tld] = results.find(r => r.domain.endsWith(tld))?.verdict || 'unknown';
  }
  return out;
}

/** Decision-ready shortlist: available exact domains first, then available-any, then unknown; taken excluded. */
export function buildDomainShortlist(byCandidate, { limit = 10 } = {}) {
  const rows = [];
  for (const [candidate, assessment] of byCandidate.entries()) {
    for (const r of (assessment.results || [])) {
      if (r.verdict === 'taken') continue;
      rows.push({ candidate, domain: r.domain, verdict: r.verdict, checked_at: r.checked_at, price: null });
    }
  }
  const rank = (row) => (row.verdict === 'available' ? (row.domain.split('.')[0].includes('-') || /^get|^try/.test(row.domain) ? 1 : 0) : 2);
  rows.sort((a, b) => rank(a) - rank(b) || a.domain.length - b.domain.length);
  return rows.slice(0, limit);
}

export default {
  resolveAvailabilityChecker, resolveAvailabilityWeight, assessCandidateAvailability,
  availabilityScore, addAvailabilityCriterion, domainVerdictFor, domainDetailFor,
  tldStatusesFor, buildDomainShortlist, DEFAULT_AVAILABILITY_WEIGHT,
};
