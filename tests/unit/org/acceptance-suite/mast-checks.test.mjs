/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- TS-2, FR-2 AC-2/AC-4: the 14 MAST checks each
 * pass the clean mock-venture baseline and fail their own broken fixture (14/14 catch rate), each
 * fixture's docblock-exported metadata is present, and the 2 cross-entity checks (FM-2.4, FM-2.5)
 * discriminate the broken entity from a well-formed sibling rather than failing indiscriminately.
 */
import { describe, it, expect } from 'vitest';
import { MAST_CHECKS } from '../../../../lib/org/acceptance-suite/checks/mast/index.mjs';
import { MAST_FIXTURES } from '../../../../lib/org/acceptance-suite/fixtures/mast/index.mjs';
import { buildMockVentureOrganization } from '../../../../lib/org/acceptance-suite/fixtures/mock-venture.mjs';
import * as fm24 from '../../../../lib/org/acceptance-suite/checks/mast/fm-2-4.mjs';
import * as fm25 from '../../../../lib/org/acceptance-suite/checks/mast/fm-2-5.mjs';

describe('TS-2: each of the 14 MAST checks catches its own broken fixture (14/14 catch rate)', () => {
  for (const checkModule of MAST_CHECKS) {
    it(`${checkModule.mastCode} (${checkModule.id}): passes the clean baseline, fails its own broken fixture`, () => {
      const cleanResult = checkModule.check(buildMockVentureOrganization());
      expect(cleanResult.passed, `${checkModule.id} unexpectedly fails the clean mock-venture baseline`).toBe(true);

      const brokenFixture = MAST_FIXTURES[checkModule.id]();
      const brokenResult = checkModule.check(brokenFixture);
      expect(brokenResult.passed, `${checkModule.id} failed to catch its own seeded broken fixture`).toBe(false);
      expect(typeof brokenResult.reason).toBe('string');
      expect(brokenResult.reason.length).toBeGreaterThan(0);
    });
  }

  it('all 14 MAST codes are present and unique', () => {
    const codes = MAST_CHECKS.map((c) => c.mastCode);
    expect(codes).toHaveLength(14);
    expect(new Set(codes).size).toBe(14);
    expect(codes.sort()).toEqual([
      'FM-1.1', 'FM-1.2', 'FM-1.3', 'FM-1.4', 'FM-1.5',
      'FM-2.1', 'FM-2.2', 'FM-2.3', 'FM-2.4', 'FM-2.5', 'FM-2.6',
      'FM-3.1', 'FM-3.2', 'FM-3.3',
    ].sort());
  });
});

describe('FR-2 AC-2: every check module names its MAST code, category, and proxy status', () => {
  for (const checkModule of MAST_CHECKS) {
    it(`${checkModule.id} exports id/mastCode/category/label/proxy`, () => {
      expect(typeof checkModule.id).toBe('string');
      expect(checkModule.mastCode).toMatch(/^FM-\d\.\d$/);
      expect(['FC1', 'FC2', 'FC3']).toContain(checkModule.category);
      expect(typeof checkModule.label).toBe('string');
      expect(typeof checkModule.proxy).toBe('boolean');
      if (checkModule.proxy) expect(typeof checkModule.proxyReason).toBe('string');
    });
  }

  it('exactly the 3 fundamentally-runtime modes are marked proxy (FM-1.3, FM-1.4, FM-2.1)', () => {
    const proxyIds = MAST_CHECKS.filter((c) => c.proxy).map((c) => c.mastCode).sort();
    expect(proxyIds).toEqual(['FM-1.3', 'FM-1.4', 'FM-2.1']);
  });
});

describe('FR-2 AC-4: cross-entity checks discriminate the broken entity from a well-formed sibling', () => {
  it('FM-2.4 (information withholding): 2 handoffs in the fixture, only the broken one flagged', () => {
    const org = MAST_FIXTURES['fm-2-4']();
    expect(org.handoffs).toHaveLength(2);
    const perHandoff = fm24.checkEach(org);
    const broken = perHandoff.find((r) => r.handoff_id === 'handoff-strategy-to-product');
    const clean = perHandoff.find((r) => r.handoff_id === 'handoff-product-to-tech');
    expect(broken.passed).toBe(false);
    expect(clean.passed).toBe(true);
  });

  it('FM-2.5 (ignored input): 2 contributions in the fixture, only the ignored one flagged', () => {
    const org = MAST_FIXTURES['fm-2-5']();
    expect(org.tasks[0].contributions).toHaveLength(2);
    const perContribution = fm25.checkEach(org);
    const ignored = perContribution.find((r) => r.role === 'VP_PRODUCT');
    const incorporated = perContribution.find((r) => r.role === 'VP_STRATEGY');
    expect(ignored.passed).toBe(false);
    expect(incorporated.passed).toBe(true);
  });
});
