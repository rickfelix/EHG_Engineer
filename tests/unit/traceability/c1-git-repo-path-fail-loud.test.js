// QF-20260704-440: PLAN-TO-LEAD traceability resolveSDContext hardcoded {EHG, EHG_Engineer}
// for gitRepoPath resolution, so any venture repo (e.g. MarketLens) target_application fell
// through to process.cwd()=EHG_Engineer root. C1's `git log --grep SD-ID` then searched the
// WRONG repo and always reported 0 commits -- a false-low cascading into traceabilityMapping/
// recommendationAdherence/implementationQuality gate scores for every venture-target SD.
//
// Fix: resolveSDContext now resolves any non-platform target_application via
// resolveRepoPathDbFirst (applications.local_path, DB-first / registry.json fallback) and
// returns gitRepoPath=null (fail-loud) when unresolvable, instead of silently defaulting to
// cwd. C1 treats a null gitRepoPath as "cannot verify" (3/7) rather than running git in the
// wrong directory and reporting a false "0 commits found" (also 3/7, but for the wrong reason
// and masking the real defect).

import { describe, it, expect } from 'vitest';
import { validateTraceabilityMapping } from '../../../scripts/modules/traceability-validation/sections/traceability-mapping.js';

function makeValidation() {
  return { score: 0, warnings: [], gate_scores: {}, details: {} };
}

describe('QF-20260704-440: C1 gitRepoPath fail-loud handling', () => {
  it('scores C1 as "cannot verify" (3/7) when gitRepoPath is null, without running git', async () => {
    const v = makeValidation();
    await validateTraceabilityMapping('SD-TEST-NULL-REPO-001', 'uuid-1', null, null, v, null, 'feature', null, 'feature');
    expect(v.warnings.some(w => w.includes('[C1]') && w.includes('repo path unresolved'))).toBe(true);
    expect(v.details.traceability_mapping.commits_referencing_sd).toBeUndefined();
  });

  it('runs git log against the provided gitRepoPath and finds a real commit reference', async () => {
    const v = makeValidation();
    // This repo's own history contains a commit referencing QF-20260704-081 (merged this session).
    await validateTraceabilityMapping('QF-20260704-081', 'uuid-2', null, null, v, null, 'feature', process.cwd(), 'feature');
    expect(v.details.traceability_mapping.commits_referencing_sd).toBeGreaterThan(0);
  });

  it('reports "no commits found" (not "cannot verify") for a resolvable repo with zero matches', async () => {
    const v = makeValidation();
    await validateTraceabilityMapping('SD-NONEXISTENT-ID-ZZZZZZZZ', 'uuid-3', null, null, v, null, 'feature', process.cwd(), 'feature');
    expect(v.warnings.some(w => w.includes('[C1] No commits found referencing SD ID'))).toBe(true);
    expect(v.warnings.some(w => w.includes('repo path unresolved'))).toBe(false);
  });
});
