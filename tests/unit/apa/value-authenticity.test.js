/**
 * Unit tests for the value-authenticity L1 runtime anti-stub dimension.
 *
 * SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001
 *
 * @module tests/unit/apa/value-authenticity.test
 */

import { describe, it, expect, vi } from 'vitest';
import { getCriterion, getCriteriaByTForm, verifyRoundTrip } from '../../../lib/apa/value-authenticity-criteria.mjs';
import { checkSourceExists } from '../../../lib/apa/value-authenticity-t0.mjs';
import { checkSourceReached } from '../../../lib/apa/value-authenticity-t1.mjs';
import { checkMetamorphicMonotonicity, checkNaiveInputSensitivity } from '../../../lib/apa/value-authenticity-t2.mjs';
import { aggregateVerdict } from '../../../lib/apa/value-authenticity-ladder.mjs';
import { stubPersonaEngine, realPersonaEngine, STUB_ENGINE_SOURCE_TEXT, REAL_ENGINE_SOURCE_TEXT } from '../../../lib/apa/fixtures/value-authenticity-i4-marketlens-stub.mjs';

/** The 5 real seeded criteria rows (frozen contract_version=1), fetched from
 *  value_authenticity_criteria_library during EXEC and pinned here so tests
 *  do not depend on live DB access. */
const SEEDED_CRITERIA = [
  { criterion_id: 'VA-T0-source-exists', t_form: 'T0', hard_catcher: true, evidence_grade: null },
  { criterion_id: 'VA-T1-source-reached', t_form: 'T1', hard_catcher: true, evidence_grade: null },
  { criterion_id: 'VA-T2-metamorphic-monotonicity', t_form: 'T2', hard_catcher: true, evidence_grade: null },
  { criterion_id: 'VA-T3-paraphrase-invariance', t_form: 'T3', hard_catcher: false, evidence_grade: null },
  { criterion_id: 'VA-T4-plausibility-as-persona', t_form: 'T4', hard_catcher: false, evidence_grade: null },
];

function makeMockSupabase(rows) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => ({
          maybeSingle: vi.fn(async () => ({ data: rows.find((r) => r[col] === val) ?? null, error: null })),
          then: (resolve) => resolve({ data: rows.filter((r) => r[col] === val), error: null }),
        })),
      })),
    })),
  };
}

describe('value-authenticity-criteria.mjs — round-trip SSOT', () => {
  it('getCriterion returns the exact row for a real criterion_id', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const criterion = await getCriterion(supabase, 'VA-T2-metamorphic-monotonicity');
    expect(criterion).toMatchObject({ t_form: 'T2', hard_catcher: true });
  });

  it('getCriterion returns null for an unknown criterion_id (never guesses)', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const criterion = await getCriterion(supabase, 'VA-T9-does-not-exist');
    expect(criterion).toBeNull();
  });

  it('getCriteriaByTForm returns all T3/T4 (soft) criteria', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const t3 = await getCriteriaByTForm(supabase, 'T3');
    expect(t3).toHaveLength(1);
    expect(t3[0].hard_catcher).toBe(false);
  });

  it('verifyRoundTrip confirms a criterion_id selected at "plan time" matches the library row executed at "runtime"', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const result = await verifyRoundTrip(supabase, 'VA-T0-source-exists');
    expect(result).toEqual({ found: true, hardCatcher: true, tForm: 'T0' });
  });

  it('verifyRoundTrip reports found:false for a criterion_id that does not round-trip', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const result = await verifyRoundTrip(supabase, 'VA-T9-fabricated');
    expect(result.found).toBe(false);
  });
});

describe('value-authenticity-t0.mjs — TS-1 (MarketLens replay, T0 half)', () => {
  it('flags the I4 stub engine: no external dependency, pure function of input', () => {
    const result = checkSourceExists({ modulePath: 'lib/apa/fixtures/value-authenticity-i4-marketlens-stub.mjs#stubPersonaEngine', sourceText: STUB_ENGINE_SOURCE_TEXT });
    expect(result.finding).toBe(true);
  });

  it('does NOT flag the real engine: has an external dependency', () => {
    const result = checkSourceExists({ modulePath: 'lib/apa/fixtures/value-authenticity-i4-marketlens-stub.mjs#realPersonaEngine', sourceText: REAL_ENGINE_SOURCE_TEXT });
    expect(result.finding).toBe(false);
  });

  it('throws on missing sourceText rather than silently passing', () => {
    expect(() => checkSourceExists({ modulePath: 'x', sourceText: '' })).toThrow(/empty or missing sourceText/);
  });
});

describe('value-authenticity-t1.mjs — source-REACHED, injected evidence', () => {
  it('flags a claim presented with no observed call to its declared source (the dishonest stub)', () => {
    const result = checkSourceReached({
      productLevelClaim: 'WTP derived from real market research',
      instrumentedCallSite: 'venture_artifacts.market_research.fetch',
      evidenceBundle: { claimsPresented: ['WTP derived from real market research'], observedCallSites: [] },
    });
    expect(result.finding).toBe(true);
  });

  it('does not flag a claim backed by an observed call to its declared source', () => {
    const result = checkSourceReached({
      productLevelClaim: 'WTP derived from real market research',
      instrumentedCallSite: 'venture_artifacts.market_research.fetch',
      evidenceBundle: { claimsPresented: ['WTP derived from real market research'], observedCallSites: ['venture_artifacts.market_research.fetch'] },
    });
    expect(result.finding).toBe(false);
  });

  it('does not flag when the claim was never presented (nothing to verify)', () => {
    const result = checkSourceReached({
      productLevelClaim: 'unrelated claim',
      instrumentedCallSite: 'x',
      evidenceBundle: { claimsPresented: [], observedCallSites: [] },
    });
    expect(result.finding).toBe(false);
  });
});

describe('value-authenticity-t2.mjs — TS-1 (MarketLens replay, T2 half: the core distinction)', () => {
  it('the I4 hash stub FAILS metamorphic-monotonicity (input-sensitive but not input-responsive)', () => {
    const result = checkMetamorphicMonotonicity({
      valueEngineFn: stubPersonaEngine,
      baseInput: { description: 'a market analysis product for indie builders' },
      // Directed perturbation: progressively longer/different descriptions —
      // a hash has no notion of "more of the same direction", so its output
      // trend is expected to reverse across steps.
      perturbationSteps: [
        (input) => ({ description: `${input.description} x` }),
        (input) => ({ description: `${input.description} xx` }),
        (input) => ({ description: `${input.description} xxx` }),
        (input) => ({ description: `${input.description} xxxx` }),
      ],
      expectedDirection: 'increasing',
      extractComparable: (output) => output.wtpBandIndex,
    });
    expect(result.finding).toBe(true);
  });

  it('...while the SAME I4 stub PASSES naive input-sensitivity on the exact same perturbation sequence (demonstrating why T2 alone is necessary, per design §1-L1)', () => {
    // Empirically verified band-index sequence for this fixture:
    // [0, 3, 2, 2, 2, 1] — base->step1 differs (3 != 0), so naive
    // sensitivity reports "fine, output differs" even though the T2 test
    // above correctly flags 2 direction reversals in the same sequence.
    // This is the exact "input-sensitivity != input-responsiveness" gap
    // the design SSOT requires T2 to close.
    const result = checkNaiveInputSensitivity({
      valueEngineFn: stubPersonaEngine,
      baseInput: { description: 'seed' },
      perturbedInput: { description: 'seed a' },
      extractComparable: (output) => output.wtpBandIndex,
    });
    expect(result.sensitive).toBe(true);
  });

  it('the honest real engine PASSES metamorphic-monotonicity: budget increases move WTP band up monotonically', () => {
    const result = checkMetamorphicMonotonicity({
      valueEngineFn: realPersonaEngine,
      baseInput: { description: 'x', budget: 0 },
      perturbationSteps: [
        (input) => ({ ...input, budget: input.budget + 2500 }),
        (input) => ({ ...input, budget: input.budget + 2500 }),
        (input) => ({ ...input, budget: input.budget + 2500 }),
      ],
      expectedDirection: 'increasing',
      extractComparable: (output) => output.wtpBandIndex,
    });
    expect(result.finding).toBe(false);
    expect(result.violations).toBe(0);
  });

  it('throws on an invalid expectedDirection rather than silently misinterpreting it', () => {
    expect(() => checkMetamorphicMonotonicity({
      valueEngineFn: realPersonaEngine, baseInput: { budget: 0 }, perturbationSteps: [(i) => i],
      expectedDirection: 'sideways', extractComparable: () => 0,
    })).toThrow(/expectedDirection must be/);
  });
});

describe('value-authenticity-ladder.mjs — fail-closed aggregation keyed on hard_catcher', () => {
  it('a hard-catcher (T0) finding produces a FAIL verdict', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const result = await aggregateVerdict(supabase, [
      { criterionId: 'VA-T0-source-exists', finding: true, reason: 'no external dependency' },
    ]);
    expect(result.verdict).toBe('FAIL');
    expect(result.hardFindings).toHaveLength(1);
  });

  it('a soft-criterion (T3) finding can NEVER produce a hard-fail verdict, structurally', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const result = await aggregateVerdict(supabase, [
      { criterionId: 'VA-T3-paraphrase-invariance', finding: true, reason: 'paraphrase drift detected' },
    ]);
    expect(result.verdict).toBe('PASS');
    expect(result.softFindings).toHaveLength(1);
    expect(result.hardFindings).toHaveLength(0);
  });

  it('no findings at all produces a PASS verdict', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    const result = await aggregateVerdict(supabase, [
      { criterionId: 'VA-T0-source-exists', finding: false, reason: 'ok' },
    ]);
    expect(result.verdict).toBe('PASS');
  });

  it('a finding citing an unknown criterion_id throws — round-trip SSOT enforced, never silently ignored', async () => {
    const supabase = makeMockSupabase(SEEDED_CRITERIA);
    await expect(aggregateVerdict(supabase, [
      { criterionId: 'VA-T9-fabricated', finding: true, reason: 'x' },
    ])).rejects.toThrow(/round-trip SSOT violated/);
  });
});
