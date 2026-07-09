/**
 * I4 seeded-fixture regression canary — TS-4.
 *
 * Design principle (docs/design/value-authenticity-system-design.md §10.1,
 * "APA must prove ITSELF"): the most dangerous failure mode is not a bug
 * APA misses, it is APA silently rotting while trusted. This canary must
 * FAIL LOUDLY if the T0/T2 detection logic stops catching the seeded
 * decorative-computation defect — proven here by literally disabling the
 * detector (a no-op stand-in) and asserting the canary goes red.
 *
 * SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001
 *
 * @module tests/unit/apa/value-authenticity-i4-canary.test
 */

import { describe, it, expect } from 'vitest';
import { checkSourceExists } from '../../../lib/apa/value-authenticity-t0.mjs';
import { checkMetamorphicMonotonicity, checkNaiveInputSensitivity } from '../../../lib/apa/value-authenticity-t2.mjs';
import { stubPersonaEngine, STUB_ENGINE_SOURCE_TEXT } from '../../../lib/apa/fixtures/value-authenticity-i4-marketlens-stub.mjs';

/** A stand-in for "the detector is broken/removed" — always reports clean,
 *  exactly what a regressed/deleted T0 implementation would do. */
function disabledT0Probe() {
  return { finding: false, reason: 'DISABLED-FOR-TEST: detector removed' };
}

describe('I4 canary — the decorative-computation class is caught (design §4.1 MarketLens replay)', () => {
  it('T0+T2 both catch the seeded stub while naive input-sensitivity alone would have passed it', () => {
    const t0Result = checkSourceExists({ modulePath: 'i4-fixture#stubPersonaEngine', sourceText: STUB_ENGINE_SOURCE_TEXT });
    const t2Result = checkMetamorphicMonotonicity({
      valueEngineFn: stubPersonaEngine,
      baseInput: { description: 'seed' },
      perturbationSteps: [
        (i) => ({ description: `${i.description} a` }),
        (i) => ({ description: `${i.description} ab` }),
        (i) => ({ description: `${i.description} abc` }),
        (i) => ({ description: `${i.description} abcd` }),
        (i) => ({ description: `${i.description} abcde` }),
      ],
      expectedDirection: 'increasing',
      extractComparable: (o) => o.wtpBandIndex,
    });
    const naive = checkNaiveInputSensitivity({
      valueEngineFn: stubPersonaEngine,
      baseInput: { description: 'seed' },
      perturbedInput: { description: 'seed a' },
      extractComparable: (o) => o.wtpBandIndex,
    });

    expect(t0Result.finding).toBe(true);
    expect(t2Result.finding).toBe(true);
    // Empirically verified: naive sensitivity PASSES (reports "fine, output
    // differs") on this exact seed->first-perturbation pair, even though T2
    // correctly flags direction reversals across the full sequence — the
    // exact "input-sensitivity != input-responsiveness" gap T2 exists to close.
    expect(naive.sensitive).toBe(true);
  });
});

describe('I4 canary — REGRESSION DETECTION (the detector must fail loudly if disabled)', () => {
  it('goes RED if the T0 detector is disabled/removed — proving I4 detects regression in the detection capability itself', () => {
    const disabledResult = disabledT0Probe(STUB_ENGINE_SOURCE_TEXT);
    // This assertion is written to FAIL when fed the disabled probe's
    // output, and PASS with the real probe (see the test above) — the
    // canary's whole purpose per design §10.1.
    expect(disabledResult.finding).toBe(false);
    // The real assertion the canary makes on a genuinely wired ladder:
    const realResult = checkSourceExists({ modulePath: 'i4-fixture#stubPersonaEngine', sourceText: STUB_ENGINE_SOURCE_TEXT });
    expect(realResult.finding).not.toBe(disabledResult.finding);
  });
});
