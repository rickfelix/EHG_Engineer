/**
 * SD-LEO-FEAT-NAMING-DOMAIN-AVAILABILITY-001 — registrar-first, RDAP-fallback
 * domain-availability resolver (FR-1) and the naming-artifact decision record (FR-2).
 *
 * Chairman lesson-learned: a taken .com (getalttext.com) reached the Cloudflare
 * purchase screen uncaught because the pre-existing RDAP-only seam was OFF by
 * default behind an opt-in flag nobody set. These tests lock: (1) the seam now
 * runs BY DEFAULT, (2) registrar credentials take priority over RDAP when present,
 * (3) a registrar failure degrades honestly rather than aborting, (4) the decision
 * record never fabricates 'available'.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveDomainAvailabilityChecker, domainAvailabilityRecordFor,
} from '../../../lib/venture-domains/stage-integration.js';

const REGISTRAR_ENV = { CLOUDFLARE_REGISTRAR_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' };

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveDomainAvailabilityChecker — resolution order', () => {
  it('runs BY DEFAULT with no env flags at all (closes the opt-in trap)', () => {
    const checker = resolveDomainAvailabilityChecker({});
    // No registrar creds and (in this Node test env) global fetch exists -> falls through
    // to the RDAP rung, which is truthy (a function) rather than the old always-null default.
    expect(typeof checker).toBe('function');
  });

  it('explicit DOMAIN_AVAILABILITY_MODE=off is the only way to fully disable the seam', () => {
    expect(resolveDomainAvailabilityChecker({ DOMAIN_AVAILABILITY_MODE: 'off' })).toBeNull();
  });

  it('prefers the registrar adapter over RDAP when credentials are present', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ success: true, result: { available: true, price: 12 } }));
    const checker = resolveDomainAvailabilityChecker(REGISTRAR_ENV);
    const assessment = await checker('Acme Lens');
    expect(assessment.results).toHaveLength(1); // registrar path checks ONE domain: the primary .com
    expect(assessment.results[0]).toMatchObject({ domain: 'acmelens.com', verdict: 'available', source: 'registrar_api', priceUsd: 12 });
  });

  it('falls back to the RDAP checker with no registrar credentials', async () => {
    vi.stubGlobal('fetch', async () => ({ status: 404 })); // RDAP: 404 = available
    const checker = resolveDomainAvailabilityChecker({});
    const assessment = await checker('Acme Lens');
    expect(assessment.results[0].source).toBe('rdap');
    expect(assessment.results[0].verdict).toBe('available');
  });

  it('a taken domain via the registrar adapter reports verdict=taken with the real price', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ success: true, result: { available: false, price: 0 } }));
    const checker = resolveDomainAvailabilityChecker(REGISTRAR_ENV);
    const assessment = await checker('Get Alt Text');
    expect(assessment.results[0]).toMatchObject({ domain: 'getalttext.com', verdict: 'taken' });
    expect(assessment.best).toBeNull();
  });

  it('a registrar-call failure degrades to unknown for that candidate — never throws, never fabricates available', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ success: false, errors: [{ message: 'rate limited' }] }, false));
    const checker = resolveDomainAvailabilityChecker(REGISTRAR_ENV);
    const assessment = await checker('Acme Lens');
    expect(assessment.results[0].verdict).toBe('unknown');
    expect(assessment.best).toBeNull();
  });
});

describe('domainAvailabilityRecordFor — FR-2 naming-artifact decision shape', () => {
  it('an available registrar result produces the full priced record', () => {
    const assessment = { results: [{ domain: 'acmelens.com', verdict: 'available', source: 'registrar_api', checked_at: '2026-07-12T00:00:00Z', priceUsd: 12 }] };
    expect(domainAvailabilityRecordFor(assessment)).toEqual({
      domain: 'acmelens.com', availability: 'available', price_usd: 12, checked_at: '2026-07-12T00:00:00Z', method: 'registrar_api',
    });
  });

  it('a taken .com produces availability=taken with no price fabricated when absent', () => {
    const assessment = { results: [{ domain: 'getalttext.com', verdict: 'taken', source: 'registrar_api', checked_at: '2026-07-12T00:00:00Z' }] };
    const record = domainAvailabilityRecordFor(assessment);
    expect(record.availability).toBe('taken');
    expect(record.price_usd).toBeNull();
  });

  it('an RDAP "unknown" verdict maps to the honest "unverified" label, never fabricated available', () => {
    const assessment = { results: [{ domain: 'x.com', verdict: 'unknown', source: 'rdap', checked_at: '2026-07-12T00:00:00Z' }] };
    expect(domainAvailabilityRecordFor(assessment).availability).toBe('unverified');
  });

  it('no assessment at all (seam fully off) produces the all-null unverified floor', () => {
    expect(domainAvailabilityRecordFor(null)).toEqual({
      domain: null, availability: 'unverified', price_usd: null, checked_at: null, method: 'unverified',
    });
    expect(domainAvailabilityRecordFor(undefined)).toEqual({
      domain: null, availability: 'unverified', price_usd: null, checked_at: null, method: 'unverified',
    });
  });
});
