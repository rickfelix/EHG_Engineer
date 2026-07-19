/**
 * Unit tests for the canonical fixture-exclusion predicates and the gauges they protect.
 * SD: SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001
 *
 * Fixture/test rows (ZZZ_/UAT/TEST keys, __e2e/is_demo/is_synthetic ventures) leaked
 * into real metrics because exclusion logic was fragmented across 7 helpers with
 * divergent prefix sets — none covered ZZZ_. These tests pin:
 *   - the predicate matrix: every fixture prefix + both venture flags match; real
 *     names/keys never do (non-over-exclusion is the fatal failure mode) (TS-1),
 *   - computePortfolioMaturity counts only non-fixture ventures (TS-2),
 *   - loadOpenQuickFixes drops fixture-titled QFs, keeps real ones (TS-3),
 *   - loadSDHierarchy drops fixture-key SDs, keeps real ones (TS-4),
 *   - the lifted UAT_FIXTURE_KEY_RE is byte-equivalent to wave-linkage's original.
 */
import { describe, test, expect } from 'vitest';
import {
  FIXTURE_KEY_RE, UAT_FIXTURE_KEY_RE, isFixtureSdKey, isFixtureVenture, isFixtureQf,
} from '../../../lib/governance/fixture-exclusion.mjs';
import { computePortfolioMaturity } from '../../../lib/capabilities/scanner-context.js';
import { loadOpenQuickFixes, loadSDHierarchy } from '../../../scripts/modules/sd-next/data-loaders.js';

describe('predicate matrix (TS-1)', () => {
  test('fixture SD keys match (unambiguous shapes only)', () => {
    for (const key of [
      'ZZZ_OKR_ALIGNMENTS_SCHEMA_TEST_SD', 'TEST-F3-RACE-1784287684096-bl1',
      'TEST-LAYER-CLAIMING-SD-1784287683799', // epoch-stamped generator residue
      'SD-DEMO-ANYTHING-001', 'UAT-RUN-42', 'UAT_FIXTURE_7', '__e2e_probe',
      'SD-UAT-FIX-TEST-E2E-1781186358703-001', 'SD-LEO-FEAT-TEST-E2E-XYZ',
    ]) {
      expect(isFixtureSdKey(key), key).toBe(true);
    }
  });

  test('real SD keys never match (non-over-exclusion — the fatal failure mode)', () => {
    for (const key of [
      'SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001', 'SD-EHG-PRODUCT-UIUX-REMEDIATION-001',
      'SD-UAT-020', 'SD-UAT-002', // real historic UAT SDs — must NOT be excluded
      // Adversarial-review CRITICAL pin (PR #6186): the SD-TEST-MANAGEMENT/TEST-MGMT
      // family is REAL completed work — the broad ^(SD-)?TEST branch that excluded it
      // was removed; these must stay visible to hierarchy/count consumers forever.
      'SD-TEST-MANAGEMENT-001', 'SD-TEST-MGMT-SCHEMA-001', 'TEST-MGMT-FIXES-001', 'TEST-LIFECYCLE-001',
      'SD-LEO-INFRA-SEND-TIME-TARGET-001', 'SD-LATEST-METRICS-001', 'SD-FASTEST-PATH-001',
      'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-G',
    ]) {
      expect(isFixtureSdKey(key), key).toBe(false);
    }
  });

  test('accepted recall loss: prefix-only fixtures without strong shapes do NOT match (precision first)', () => {
    // Missing a fixture slightly inflates a count; excluding a real row silently loses
    // work. These prefix-only shapes are indistinguishable from real keys, so they pass.
    expect(isFixtureSdKey('SD-TEST-MRO18ZP0-ORCH-001')).toBe(false);
    expect(isFixtureSdKey('TEST-HARNESS-CASE-9')).toBe(false);
  });

  test('metadata.is_fixture short-circuits; missing input fails open', () => {
    expect(isFixtureSdKey('SD-REAL-001', { is_fixture: true })).toBe(true);
    expect(isFixtureSdKey(null)).toBe(false);
    expect(isFixtureSdKey(undefined, null)).toBe(false);
  });

  test('venture predicate: flags OR name-prefix backstop; real ventures pass through', () => {
    expect(isFixtureVenture({ name: 'MarketLens', is_demo: false, is_synthetic: false })).toBe(false);
    expect(isFixtureVenture({ name: 'MarketLens', is_demo: true })).toBe(true);
    expect(isFixtureVenture({ name: 'Real Co', is_synthetic: true })).toBe(true);
    for (const name of ['ZZZ_seed_venture', '__e2e_venture', 'TEST-venture', 'UAT-venture', 'parity-test-1', 'test-stub', 'Test Venture for claims']) {
      expect(isFixtureVenture({ name }), name).toBe(true);
    }
    expect(isFixtureVenture({ name: 'Testify Analytics' })).toBe(false); // no separator — real name
    expect(isFixtureVenture(null)).toBe(false);
    expect(isFixtureVenture({})).toBe(false);
  });

  test('QF predicate: unambiguous fixture ids/titles match, real ones never do', () => {
    expect(isFixtureQf({ id: 'QF-TEST-123', title: 'anything' })).toBe(true);
    expect(isFixtureQf({ id: 'QF-20260717-794', title: 'ZZZ_ probe row' })).toBe(true);
    expect(isFixtureQf({ id: 'QF-20260717-794', title: '__e2e residue row' })).toBe(true);
    expect(isFixtureQf({ id: 'QF-20260717-794', title: '[Retro action items] real fix' })).toBe(false);
    expect(isFixtureQf({ id: 'QF-20260717-794', title: 'Fix latest test failures in CI' })).toBe(false); // 'test' mid-title — real
    // Adversarial-review CRITICAL pin (PR #6186): real bug reports titled 'Test-…' exist
    // (live: 'Test-fixture ventures leak stage gates…') — the bare TEST-/UAT-/DEMO title
    // branches were removed; these must never be hidden from dispatch surfaces.
    expect(isFixtureQf({ id: 'QF-20260703-236', title: 'Test-fixture ventures leak stage gates into the LIVE chairman decision queue' })).toBe(false);
    expect(isFixtureQf({ id: 'QF-20260703-773', title: 'Test-fixture key guard misses bare TEST-*/DEMO- keys' })).toBe(false);
    expect(isFixtureQf({ id: 'QF-20260717-794', title: '[TEST] harness row' })).toBe(false); // bracket tag unverified as fixture marker — precision first
    expect(isFixtureQf(null)).toBe(false);
  });

  test('lifted UAT regex is byte-equivalent to wave-linkage original', () => {
    expect(UAT_FIXTURE_KEY_RE.source).toBe('^SD-UAT-FIX-TEST-');
    expect(FIXTURE_KEY_RE.test('SD-UAT-FIX-TEST-E2E-1781186358703-001')).toBe(true);
  });
});

describe('computePortfolioMaturity excludes fixture ventures (TS-2)', () => {
  function mockSupabase(ventures) {
    return {
      from(table) {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          limit() { return Promise.resolve({ data: ventures, error: null }); },
          then(resolve) { // head-count queries resolve the chain directly
            resolve({ count: 0, error: null, data: null });
          },
        };
        if (table === 'ventures') return chain;
        return chain;
      },
    };
  }

  test('2 real + 3 fixture ventures → ventureCount 2', async () => {
    const result = await computePortfolioMaturity(mockSupabase([
      { name: 'MarketLens', is_demo: false, is_synthetic: false },
      { name: 'CronGenius', is_demo: false, is_synthetic: false },
      { name: 'ZZZ_seed', is_demo: false, is_synthetic: false },
      { name: 'Real-flagged', is_demo: true },
      { name: 'Synthetic-co', is_synthetic: true },
    ]));
    expect(result.ventureCount).toBe(2);
  });
});

describe('worker-facing loaders exclude fixtures (TS-3, TS-4)', () => {
  function mockLoaderSupabase(rows) {
    const chain = {
      select() { return chain; },
      in() { return chain; },
      is() { return chain; },
      eq() { return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: rows, error: null }); },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 4: loadSDHierarchy now
      // range-paginates (fetchAllPaginated); a short first page ends the loop.
      range() { return Promise.resolve({ data: rows, error: null }); },
    };
    return { from() { return chain; } };
  }

  test('loadOpenQuickFixes drops fixture-titled QFs, keeps real ones (TS-3)', async () => {
    const result = await loadOpenQuickFixes(mockLoaderSupabase([
      { id: 'QF-REAL', status: 'open', title: '[Retro action items] real', owner: null, release_condition: null },
      { id: 'QF-FIX', status: 'open', title: 'ZZZ_ test row', owner: null, release_condition: null },
    ]));
    const ids = result.map((r) => r.id);
    expect(ids).toContain('QF-REAL');
    expect(ids).not.toContain('QF-FIX');
  });

  test('loadSDHierarchy drops fixture-key SDs, keeps real ones (TS-4)', async () => {
    const { allSDs } = await loadSDHierarchy(mockLoaderSupabase([
      { id: 'u1', sd_key: 'SD-REAL-001', parent_sd_id: null, metadata: {} },
      { id: 'u2', sd_key: 'ZZZ_OKR_ALIGNMENTS_SCHEMA_TEST_SD', parent_sd_id: null, metadata: {} },
      { id: 'u3', sd_key: 'TEST-F3-RACE-1784287684096-bl1', parent_sd_id: null, metadata: {} },
    ]));
    expect(allSDs.has('SD-REAL-001')).toBe(true);
    expect(allSDs.has('ZZZ_OKR_ALIGNMENTS_SCHEMA_TEST_SD')).toBe(false);
    expect(allSDs.has('TEST-F3-RACE-1784287684096-bl1')).toBe(false);
  });
});
