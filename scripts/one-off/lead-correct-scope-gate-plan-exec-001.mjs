#!/usr/bin/env node
/**
 * LEAD-phase scope correction for SD-LEO-FIX-GATE-PLAN-EXEC-001.
 *
 * The escalating QF (QF-20260903-239) correctly identified the mechanism (gate-1-plan-to-exec.js's
 * prdQualityValidation calls validatePRDQuality directly instead of the leniency-applying
 * validatePRDForHandoff), but its proposed literal fix (swap the call, minimumScore=50) is NOT
 * zero-regression as claimed: validation-agent (sub_agent_execution_results c84eda3c-0670-406e-80a6-
 * d7c42b650f02, VALIDATION, CONDITIONAL_PASS/92) measured that a naive swap regresses 447 of 1698
 * heuristic-path PRDs, because validatePRDForHandoff returns {valid,...} with no `passed`/`max_score`,
 * so ValidatorRegistry.normalizeResult's `??` chain falls through to `score>=100`. Three further gaps
 * (AI-path scope leak via post-wrapper details.method, an empty-PRD quality-floor hole at score 53,
 * and a TypeError on `{}` input) were also found. This script records the mechanism-claim verification
 * (satisfies GATE_MECHANISM_CLAIM_VERIFIER) and folds VALIDATION's 5 mandatory conditions into the SD's
 * scope/risks so PLAN inherits the corrected design constraints rather than the QF's unsafe literal-swap
 * approach.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-GATE-PLAN-EXEC-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata, scope, risks, key_changes')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('❌ Fetch failed:', fetchErr.message);
  process.exit(1);
}

const CORRECTED_SCOPE = `Expected: prdQualityValidation (gate-1-plan-to-exec.js) applies validatePRDForHandoff's score-based leniency instead of validatePRDHeuristic's strict score>=50 && issues.length===0 pass condition, WITHOUT regressing any currently-passing PRD.
Actual: Gate unconditionally fails whenever issues.length>0, regardless of score -- confirmed live against SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A's real PRD (score 70%, 3 legitimate flagged FRs, precheck FAILED).

CORRECTED DESIGN (LEAD, per VALIDATION evidence c84eda3c-0670-406e-80a6-d7c42b650f02, CONDITIONAL_PASS/92 -- the escalating QF's literal proposed fix is NOT safe as written and must NOT be implemented verbatim):
The QF's mechanism diagnosis is correct; its literal fix (swap the call to validatePRDForHandoff, minimumScore=50) is measured to regress 447 of 1698 heuristic-path PRDs, because validatePRDForHandoff returns {valid,...} with no passed/max_score field, so ValidatorRegistry.normalizeResult's nullish-coalesce chain falls through to score>=100 -- the opposite of leniency. PLAN's PRD MUST instead satisfy all 5 conditions below (mandatory, not advisory):
1. Explicit field mapping at the gate boundary: registry.normalizeResult must receive an explicit passed:=<wrapper's valid> and max_score:=100 -- never rely on the wrapper's native shape falling through normalizeResult's fallback chain. Required test: a score-85-with-1-issue heuristic PRD yields passed===true after normalizeResult.
2. Heuristic-only scoping must NOT depend on post-wrapper result.details.method (it does not survive normalizeResult/validatePRDForHandoff intact). Prefer: call validatePRDQuality once, apply the leniency reclassification inline guarded by result.details?.method==='heuristic', rather than routing through validatePRDForHandoff (which has no method-awareness and would also relax the 2979-PRD AI-rubric path, out of this SD's stated scope).
3. The minimum-score floor must be justified against the measured empty-PRD score of 53 for reduced-penalty SD types (bugfix/infrastructure/refactor/fix/documentation) -- minimumScore=50 alone makes the required:true gate incapable of blocking ANY of the 1698 live heuristic PRDs (observed minimum score 60) and would accept a completely empty PRD. Prefer reusing getStoryMinimumScoreByCategory(sd.category, sd.sd_type) (scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js:59), matching the already-live legacy PlanToExecVerifier check, retaining an unconditional block on the insufficient-functional-requirements/insufficient-acceptance-criteria issue classes regardless of score.
4. A stated decision reconciling this gate's threshold with the live PlanToExecVerifier.js:339 legacy PRD_BOILERPLATE check, which already calls validatePRDForHandoff with a per-category threshold (55 for category=Fix) for the SAME PLAN-TO-EXEC handoff -- two live checks must not silently disagree.
5. Optional chaining (result.details?.method) so a truthy {} PRD (passes gate-1's "if (!prd)" guard, reaches validatePRDQuality's empty-PRD fast-fail, which returns no details key) does not throw a TypeError.

Required regression tests (from VALIDATION recommendations): (a) score-85-with-1-issue heuristic PRD -> gate passed===true; (b) empty-object {} PRD does not throw; (c) an AI-path PRD preserves the rubric's own verdict (proves scoping); (d) a totally-empty reduced-penalty PRD still FAILS the gate.

MEASUREMENT CORRECTION: the QF claimed 216 newly-passing PRDs; VALIDATION's independent full-population re-run (4677 PRDs paginated, 1698 heuristic-path) measured 109 newly-pass / 0 regressions for the CORRECTLY-WIRED variant. Cite 109, not 216, going forward.`;

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'Explore sub-agent (LEAD-phase discovery pass, independent read of gate-1-plan-to-exec.js/prd-quality-validation.js/validator-registry/core.js); cross-verified by validation-agent (sub_agent_execution_results VALIDATION c84eda3c-0670-406e-80a6-d7c42b650f02, phase=LEAD, verdict=CONDITIONAL_PASS/92, agentId a9537e5e18e1f201a) via direct file reads PLUS live module execution',
      verified_at: 'scripts/modules/handoff/validation/validator-registry/gates/gate-1-plan-to-exec.js:25',
      claim: 'prdQualityValidation calls validatePRDQuality(prd, mergedOptions) directly (not validatePRDForHandoff), and validatePRDHeuristic (prd-quality-validation.js:249, `passed = score >= 50 && issues.length === 0`) hard-fails on any nonzero issues.length regardless of score. registry.normalizeResult (validator-registry/core.js:126) passes this boolean through unchanged, so a required:true gate hard-blocks PLAN-TO-EXEC on a well-scoring PRD with even one flagged issue -- confirmed live against SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A (score 70%, 3 flagged FRs, precheck FAILED).',
      reproduction: 'Both sub-agents independently opened gate-1-plan-to-exec.js, prd-quality-validation.js, and validator-registry/core.js and quoted identical line numbers/content. validation-agent additionally executed the modules live: a PRD scoring 85 with 1 issue currently normalizes to passed=false (the defect), and a naive fix (literal swap to validatePRDForHandoff) normalizes the SAME PRD to passed=false too (via a different, worse mechanism -- the wrapper\'s valid/no-max_score shape falls through normalizeResult\'s fallback to score>=100), demonstrating end-to-end why the QF\'s literal proposed fix cannot be implemented as written.'
    }
  ]
};

const correctedRisks = [
  {
    risk: 'Implementation may not fully address root cause',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs'
  },
  {
    risk: 'A literal implementation of the QF\'s proposed fix (swap to validatePRDForHandoff, minimumScore=50) regresses 447 of 1698 heuristic-path PRDs -- validated live by VALIDATION (c84eda3c-0670-406e-80a6-d7c42b650f02) -- because the wrapper returns {valid,...} with no passed/max_score, which falls through ValidatorRegistry.normalizeResult\'s nullish-coalesce chain to score>=100.',
    impact: 'high',
    likelihood: 'high',
    mitigation: 'PLAN\'s PRD must encode all 5 VALIDATION conditions verbatim (explicit passed/max_score mapping; heuristic-only scoping via inline reclassification, not post-wrapper details.method; a threshold above the measured empty-PRD floor of 53, e.g. getStoryMinimumScoreByCategory; reconciliation with the live PlanToExecVerifier per-category threshold; optional chaining on details?.method) plus the 4 required regression tests before EXEC implements.'
  }
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata, scope: CORRECTED_SCOPE, risks: correctedRisks })
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('❌ Update failed:', updateErr.message);
  process.exit(1);
}

console.log('✅ Mechanism verification recorded + scope/risks corrected for', SD_KEY);
