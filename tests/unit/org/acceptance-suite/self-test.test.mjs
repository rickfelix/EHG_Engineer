/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- TS-10: the full suite self-test, A3's literal
 * shape -- ONE run over a mixed battery (the clean mock-venture case plus all 14 broken MAST
 * fixtures) reporting BOTH pass_rate (on the clean case) and catch_rate (on the 14 broken cases)
 * together, as design feedback 20b858dc section 5 A3 describes: "every run must fail every
 * fixture; catch rate reported beside pass rate."
 */
import { describe, it, expect } from 'vitest';
import { runSuite } from '../../../../lib/org/acceptance-suite/run-suite.mjs';
import { MAST_CHECKS } from '../../../../lib/org/acceptance-suite/checks/mast/index.mjs';
import { MAST_FIXTURES } from '../../../../lib/org/acceptance-suite/fixtures/mast/index.mjs';
import { buildMockVentureOrganization } from '../../../../lib/org/acceptance-suite/fixtures/mock-venture.mjs';

describe('TS-10: full self-test -- 100% pass rate on the clean control, 100% catch rate on all 14 broken fixtures', () => {
  it('runs one battery of 1 clean case + 14 broken fixtures through all 14 MAST checks', async () => {
    const cases = [
      { id: 'mock-venture', organization: buildMockVentureOrganization(), expectedBroken: false },
      ...Object.entries(MAST_FIXTURES).map(([fixtureId, buildFixture]) => ({
        id: fixtureId,
        organization: buildFixture(),
        expectedBroken: true,
      })),
    ];

    const result = await runSuite({ cases, checks: MAST_CHECKS });

    expect(result.pass_rate).toBe(100);
    expect(result.catch_rate).toBe(100);
    expect(result.findings.length).toBe(cases.length * MAST_CHECKS.length);
  });
});
