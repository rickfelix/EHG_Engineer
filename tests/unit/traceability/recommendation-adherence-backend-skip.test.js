// QF-20260527-961: prevent regression of the Gate 3 / Section A.1 design
// adherence false-zero for backend-only SDs.
//
// Pre-fix behavior: when DESIGN sub-agent returned skip_reason='backend_only_diff'
// (correctly indicating zero UI files in diff), Gate 3's recommendation-
// adherence section fell through to the "no design fidelity data" branch and
// produced 50%, causing the PLAN-TO-LEAD handoff to flag low adherence.
// Witnessed blocking SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C (Legion-Laptop session).
//
// Post-fix: any of the three applicability-skip reasons (backend_only_diff,
// ehg_only_diff, engineer_only_diff) short-circuits to 100% adherence — there
// are no design recommendations to adhere to.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateRecommendationAdherence } from '../../../scripts/modules/traceability-validation/sections/recommendation-adherence.js';

function makeValidation() {
  return { score: 0, warnings: [], gate_scores: {}, details: {} };
}

describe('QF-20260527-961: backend-only-diff DESIGN skip → 100% design adherence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants full design adherence (10/10) when designAnalysis.skip_reason=backend_only_diff', async () => {
    const v = makeValidation();
    const designAnalysis = { skip_reason: 'backend_only_diff', verdict: 'PASS' };
    const databaseAnalysis = null;
    const gate2Data = { gate_scores: {}, details: {} };
    await validateRecommendationAdherence('SD-TEST-BACKEND-001', designAnalysis, databaseAnalysis, gate2Data, v, null, null, 'feature');
    expect(v.details.recommendation_adherence.design_adherence_percent).toBe(100);
    expect(v.details.recommendation_adherence.design_skip_reason).toBe('backend_only_diff');
  });

  it('grants full design adherence when skip_reason is nested under metadata', async () => {
    const v = makeValidation();
    const designAnalysis = { metadata: { skip_reason: 'ehg_only_diff' }, verdict: 'PASS' };
    const gate2Data = { gate_scores: {}, details: {} };
    await validateRecommendationAdherence('SD-TEST-EHG-001', designAnalysis, null, gate2Data, v, null, null, 'feature');
    expect(v.details.recommendation_adherence.design_adherence_percent).toBe(100);
    expect(v.details.recommendation_adherence.design_skip_reason).toBe('ehg_only_diff');
  });

  it('grants full design adherence when skip_reason is nested under results.metadata', async () => {
    const v = makeValidation();
    const designAnalysis = { results: { metadata: { skip_reason: 'engineer_only_diff' } }, verdict: 'PASS' };
    const gate2Data = { gate_scores: {}, details: {} };
    await validateRecommendationAdherence('SD-TEST-ENGINEER-001', designAnalysis, null, gate2Data, v, null, null, 'feature');
    expect(v.details.recommendation_adherence.design_adherence_percent).toBe(100);
    expect(v.details.recommendation_adherence.design_skip_reason).toBe('engineer_only_diff');
  });

  it('does NOT short-circuit on unrecognized skip_reason (must be one of the 3 applicability reasons)', async () => {
    const v = makeValidation();
    const designAnalysis = { skip_reason: 'random_other_reason', verdict: 'PASS' };
    const gate2Data = { gate_scores: {}, details: {} };
    await validateRecommendationAdherence('SD-TEST-UNK-001', designAnalysis, null, gate2Data, v, null, null, 'feature');
    // Falls through to the no-design-fidelity-data branch (5/10) — NOT 100%
    expect(v.details.recommendation_adherence.design_adherence_percent).toBeUndefined();
    expect(v.details.recommendation_adherence.design_skip_reason).toBeUndefined();
  });

  it('does NOT short-circuit when designAnalysis is null/undefined (regression guard)', async () => {
    const v = makeValidation();
    const gate2Data = { gate_scores: {}, details: {} };
    await validateRecommendationAdherence('SD-TEST-NULL-001', null, null, gate2Data, v, null, null, 'feature');
    expect(v.details.recommendation_adherence.design_adherence_percent).toBeUndefined();
  });
});
