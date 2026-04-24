/**
 * Regression tests for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-3.
 *
 * Covers basicPRDValidation sd_type-aware threshold behavior and
 * resolvePRDThreshold DB lookup with fallback.
 *
 * Addresses PAT-HF-PLANTOEXEC-813875a9 (PRD-quality half): flat 100%
 * threshold rejected infra PRDs with 6 of 7 fields (86%).
 */

import { describe, it, expect } from 'vitest';
import {
  basicPRDValidation,
  resolvePRDThreshold,
  PRD_THRESHOLD_FALLBACK
} from '../../../scripts/modules/handoff/verifiers/plan-to-exec/prd-validation.js';

function makePRD(fieldsPresent) {
  // 7 required fields per PRD_REQUIREMENTS; pass an array of which to populate.
  const allFields = [
    'executive_summary',
    'functional_requirements',
    'system_architecture',
    'acceptance_criteria',
    'test_scenarios',
    'implementation_approach',
    'risks'
  ];
  const prd = {};
  for (const f of allFields) {
    if (!fieldsPresent.includes(f)) continue;
    if (f === 'functional_requirements') {
      prd[f] = [{ id: 'FR-1' }, { id: 'FR-2' }, { id: 'FR-3' }];
    } else {
      prd[f] = `populated ${f}`;
    }
  }
  return prd;
}

function mockSupabase({ sdType, threshold, throwOnLookup = false }) {
  return {
    from: (table) => ({
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => {
            if (throwOnLookup) throw new Error('simulated DB failure');
            if (table !== 'sd_type_validation_profiles' || col !== 'sd_type') {
              return { data: null, error: null };
            }
            if (val !== sdType) return { data: null, error: null };
            return { data: { prd_minimum_score: threshold }, error: null };
          }
        })
      })
    })
  };
}

describe('basicPRDValidation sd_type-aware threshold', () => {
  it('infrastructure SD PRD with 6 of 7 fields (86%) passes at threshold 80', () => {
    const prd = makePRD([
      'executive_summary',
      'functional_requirements',
      'system_architecture',
      'acceptance_criteria',
      'test_scenarios',
      'implementation_approach'
      // risks missing → 6 of 7
    ]);
    const result = basicPRDValidation(prd, { minimumScore: 80 });
    expect(result.percentage).toBe(86);
    expect(result.thresholdApplied).toBe(80);
    expect(result.valid).toBe(true);
  });

  it('security SD PRD with 6 of 7 fields (86%) fails at threshold 90', () => {
    const prd = makePRD([
      'executive_summary',
      'functional_requirements',
      'system_architecture',
      'acceptance_criteria',
      'test_scenarios',
      'implementation_approach'
    ]);
    const result = basicPRDValidation(prd, { minimumScore: 90 });
    expect(result.percentage).toBe(86);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('below sd_type threshold 90%'))).toBe(true);
  });

  it('feature SD PRD with 6 of 7 fields (86%) passes at threshold 85 (boundary)', () => {
    const prd = makePRD([
      'executive_summary',
      'functional_requirements',
      'system_architecture',
      'acceptance_criteria',
      'test_scenarios',
      'implementation_approach'
    ]);
    const result = basicPRDValidation(prd, { minimumScore: 85 });
    expect(result.percentage).toBe(86);
    expect(result.valid).toBe(true);
  });

  it('backward-compat: no options → all-fields-required (existing callers unchanged)', () => {
    const prd = makePRD([
      'executive_summary',
      'functional_requirements',
      'system_architecture',
      'acceptance_criteria',
      'test_scenarios',
      'implementation_approach'
      // 1 field missing
    ]);
    const result = basicPRDValidation(prd);
    expect(result.valid).toBe(false);
    expect(result.thresholdApplied).toBeUndefined();
  });

  it('negative control: PRD with 3 of 7 fields (43%) fails for all thresholds (FR-6 AC-2)', () => {
    const prd = makePRD(['executive_summary', 'functional_requirements', 'risks']);
    for (const threshold of [60, 80, 85, 90]) {
      const result = basicPRDValidation(prd, { minimumScore: threshold });
      expect(result.valid).toBe(false);
    }
  });
});

describe('resolvePRDThreshold DB lookup + fallback', () => {
  it('returns the seeded prd_minimum_score for a known sd_type', async () => {
    const supabase = mockSupabase({ sdType: 'infrastructure', threshold: 80 });
    const threshold = await resolvePRDThreshold(supabase, 'infrastructure');
    expect(threshold).toBe(80);
  });

  it('returns fallback 85 when the profile row is missing', async () => {
    const supabase = mockSupabase({ sdType: 'infrastructure', threshold: 80 });
    const threshold = await resolvePRDThreshold(supabase, 'unknown_type');
    expect(threshold).toBe(PRD_THRESHOLD_FALLBACK);
    expect(threshold).toBe(85);
  });

  it('returns fallback 85 when sdType is null/undefined', async () => {
    const supabase = mockSupabase({ sdType: 'infrastructure', threshold: 80 });
    expect(await resolvePRDThreshold(supabase, null)).toBe(85);
    expect(await resolvePRDThreshold(supabase, undefined)).toBe(85);
  });

  it('returns fallback 85 when the supabase client is missing', async () => {
    expect(await resolvePRDThreshold(null, 'infrastructure')).toBe(85);
    expect(await resolvePRDThreshold({}, 'infrastructure')).toBe(85);
  });

  it('returns fallback 85 when the DB call throws', async () => {
    const supabase = mockSupabase({ sdType: 'infrastructure', threshold: 80, throwOnLookup: true });
    const threshold = await resolvePRDThreshold(supabase, 'infrastructure');
    expect(threshold).toBe(85);
  });
});
