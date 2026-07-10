/**
 * SD-LEO-FEAT-VENTURE-DOMAIN-AVAILABILITY-001 — adapter invariants.
 * All I/O injected: no network, no real timers.
 */
import { describe, it, expect } from 'vitest';
import {
  toLabel, generatePermutations, createRateBudget, checkDomainAvailability,
  checkCandidateAvailability, MAX_PERMUTATIONS, DEFAULT_TLDS,
} from '../../../lib/venture-domains/availability.js';
import {
  availabilityScore, addAvailabilityCriterion, domainVerdictFor, tldStatusesFor,
  buildDomainShortlist, assessCandidateAvailability, resolveAvailabilityChecker,
} from '../../../lib/venture-domains/stage-integration.js';

const fetchWithStatus = (status) => async () => ({ status });
const failingFetch = async () => { throw new Error('ECONNRESET'); };
const NOW = () => new Date('2026-07-10T00:00:00Z');

describe('generatePermutations', () => {
  it('emits exact-first, then hyphenated and prefixed labels across the default TLD set, deduped and capped', () => {
    const perms = generatePermutations('Acme Lens');
    expect(perms[0]).toBe('acmelens.com'); // exact label, first TLD — order is load-bearing (tldStatusesFor)
    expect(perms).toContain('acmelens.io');
    expect(perms).toContain('acme-lens.com');
    expect(perms).toContain('getacmelens.com');
    expect(perms).toContain('tryacmelens.app');
    expect(new Set(perms).size).toBe(perms.length);
    expect(perms.length).toBeLessThanOrEqual(MAX_PERMUTATIONS);
  });

  it('slugifies punctuation and returns [] for an empty name', () => {
    expect(toLabel("O'Neil & Sons!")).toBe('oneil-sons');
    expect(generatePermutations('!!!')).toEqual([]);
  });
});

describe('checkDomainAvailability — honest verdict mapping', () => {
  it('404 -> available; 2xx -> taken', async () => {
    expect((await checkDomainAvailability('x.com', { fetch: fetchWithStatus(404), now: NOW })).verdict).toBe('available');
    expect((await checkDomainAvailability('x.com', { fetch: fetchWithStatus(200), now: NOW })).verdict).toBe('taken');
  });

  it('429 / 5xx / network error / missing fetch -> unknown with a reason — NEVER available', async () => {
    for (const r of [
      await checkDomainAvailability('x.com', { fetch: fetchWithStatus(429), now: NOW }),
      await checkDomainAvailability('x.com', { fetch: fetchWithStatus(503), now: NOW }),
      await checkDomainAvailability('x.com', { fetch: failingFetch, now: NOW }),
      await checkDomainAvailability('x.com', { now: NOW }),
    ]) {
      expect(r.verdict).toBe('unknown');
      expect(r.reason).toBeTruthy();
      expect(r.checked_at).toBe('2026-07-10T00:00:00.000Z');
    }
  });
});

describe('rate budget', () => {
  it('caps lookups and marks the tail unknown(budget_exhausted)', async () => {
    let calls = 0;
    const countingFetch = async () => { calls++; return { status: 404 }; };
    const budget = createRateBudget({ maxLookups: 3, minIntervalMs: 0, now: () => 0, sleep: async () => {} });
    const { results } = await checkCandidateAvailability('Acme Lens', { fetch: countingFetch, now: NOW, budget });
    expect(calls).toBe(3);
    const tail = results.slice(3);
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every(r => r.verdict === 'unknown' && r.reason === 'budget_exhausted')).toBe(true);
  });

  it('paces lookups via the injected sleep', async () => {
    const sleeps = [];
    let t = 0;
    const budget = createRateBudget({ maxLookups: 3, minIntervalMs: 100, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    await budget.take(); t += 10; // 90ms early
    await budget.take();
    expect(sleeps).toEqual([90]);
  });
});

describe('scoring + decision helpers', () => {
  const mk = (verdicts) => ({ results: verdicts.map((v, i) => ({ domain: `d${i}.com`, verdict: v, checked_at: 'T' })) });

  it('availabilityScore: exact-open=100, some-open=70, all-taken=0, unknowns=40', () => {
    expect(availabilityScore(mk(['available', 'taken']))).toBe(100);
    expect(availabilityScore(mk(['taken', 'available']))).toBe(70);
    expect(availabilityScore(mk(['taken', 'taken']))).toBe(0);
    expect(availabilityScore(mk(['taken', 'unknown']))).toBe(40);
    expect(availabilityScore({ results: [] })).toBe(40);
  });

  it('addAvailabilityCriterion rescales existing weights to sum exactly 100', () => {
    const out = addAvailabilityCriterion([{ name: 'A', weight: 60 }, { name: 'B', weight: 40 }], 15);
    expect(out.find(c => c.name === 'Availability').weight).toBe(15);
    expect(out.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it('domainVerdictFor and tldStatusesFor map honestly', () => {
    expect(domainVerdictFor(mk(['taken', 'available']))).toBe('available');
    expect(domainVerdictFor(mk(['taken', 'taken']))).toBe('taken');
    expect(domainVerdictFor(mk(['taken', 'unknown']))).toBe('unknown');
    expect(domainVerdictFor(null)).toBe('unknown');
    const a = { results: [
      { domain: 'acme.com', verdict: 'taken', checked_at: 'T' },
      { domain: 'acme.io', verdict: 'available', checked_at: 'T' },
    ] };
    expect(tldStatusesFor(a)).toEqual({ '.com': 'taken', '.io': 'available', '.ai': 'unknown' });
  });

  it('buildDomainShortlist excludes taken, ranks exact-available first', () => {
    const byCandidate = new Map([['Acme', { results: [
      { domain: 'get-acme.com', verdict: 'available', checked_at: 'T' },
      { domain: 'acme.com', verdict: 'taken', checked_at: 'T' },
      { domain: 'acme.io', verdict: 'available', checked_at: 'T' },
      { domain: 'acme.ai', verdict: 'unknown', checked_at: 'T' },
    ] }]]);
    const list = buildDomainShortlist(byCandidate);
    expect(list.map(r => r.domain)).toEqual(['acme.io', 'get-acme.com', 'acme.ai']);
    expect(list.every(r => r.price === null)).toBe(true);
  });
});

describe('activation seam', () => {
  it('resolveAvailabilityChecker is null unless DOMAIN_AVAILABILITY_MODE=live (default OFF)', () => {
    expect(resolveAvailabilityChecker({})).toBeNull();
    expect(resolveAvailabilityChecker({ DOMAIN_AVAILABILITY_MODE: 'off' })).toBeNull();
    expect(typeof resolveAvailabilityChecker({ DOMAIN_AVAILABILITY_MODE: 'live' })).toBe('function');
  });

  it('assessCandidateAvailability never throws on a checker fault', async () => {
    const byCandidate = await assessCandidateAvailability(['A', 'B'], async (n) => {
      if (n === 'B') throw new Error('boom');
      return { candidate: n, results: [{ domain: 'a.com', verdict: 'available', checked_at: 'T' }], best: null };
    });
    expect(byCandidate.get('A').results).toHaveLength(1);
    expect(byCandidate.get('B').results).toEqual([]);
    expect(byCandidate.get('B').error).toContain('boom');
  });
});
