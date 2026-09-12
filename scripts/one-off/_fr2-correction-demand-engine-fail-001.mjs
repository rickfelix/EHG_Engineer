import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const PRD_ID = 'PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('functional_requirements, test_scenarios, risks').eq('id', PRD_ID).single();
if (readErr) { console.error(readErr.message); process.exit(1); }

const frs = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-2') {
    return {
      ...fr,
      requirement: "Add launch_mode='live' as an additional AND-condition on the predicate's rule (e), as belt-and-suspenders — leave rule (c)'s is_demo=true OUT_OF_SCOPE exemption UNCHANGED",
      description: "CORRECTED (verified by querying live ventures, 2026-09-12): my LEAD-phase claim that 'is_demo=true ventures are unsafely ungated' was WRONG. checkStageGate()'s rule (c) already treats is_demo=true as OUT_OF_SCOPE, and this is CORRECT, chairman-commissioned, deliberate design (see the module docblock: 'a DELIBERATE consequence for CI fixture design') -- verified by sampling live is_demo=true rows: all examined rows are CI/test fixtures ('Pipeline-Test-...', '__e2e_park_status_...', 'TS-fixture-...', 'TEST-HARNESS-...'), never real customer-facing ventures. Rule (c) must NOT change. The genuine remaining gap: rule (e)'s comparison (actualStage < requiredStage) does not check launch_mode at all. Measured: ALL 30 non-demo ventures have launch_mode='simulated' (0/171 ventures have launch_mode='live' anywhere); the only 2 non-demo ventures past stage 24 (DataDistill S27, MarketLens S25) are both status='cancelled', so no currently-ACTIVE venture is mis-passed by the stage-only rule today. This is a forward-looking, belt-and-suspenders fix: launch_mode='live' is set only via a separate chairman-gated S24 go-live authorization (lib/eva/launch-mode.js); adding it as an explicit AND-condition on rule (e) ensures a venture whose stage advances to 24+ through any OTHER path (a migration, a manual stage bump, a future bug) is still correctly blocked until that separate authorization has actually happened, rather than relying on the two transitions always staying in lockstep by convention alone.",
      priority: 'HIGH',
      acceptance_criteria: [
        "A venture with current_lifecycle_stage>=24 and launch_mode!='live' is blocked (rule (e) verdict is BLOCK)",
        "A venture with current_lifecycle_stage>=24 AND launch_mode='live' passes (rule (e) verdict is PASS) — the intended eventual state once a real go-live occurs",
        'Rule (c) (is_demo=true -> OUT_OF_SCOPE) is verified UNCHANGED by a regression test against the existing stage-gate-predicate.test.js suite',
      ],
    };
  }
  return fr;
});

const testScenarios = prd.test_scenarios.map((ts) => {
  if (ts.id === 'TS-3') {
    return {
      id: 'TS-3',
      scenario: "A non-demo venture at stage>=24 with launch_mode!='live' is blocked by rule (e)'s new AND-condition (is_demo/rule (c) is untouched and stays OUT_OF_SCOPE)",
      test_type: 'unit',
      given: "A non-demo venture with current_lifecycle_stage=25, launch_mode='simulated'",
      when: "checkStageGate({...}) computes the raw verdict, then shouldEnforceBlock(result) evaluates it",
      then: "verdict=BLOCK (rule (e): stage>=24 but launch_mode!='live'); a SEPARATE regression test confirms an is_demo=true venture is still OUT_OF_SCOPE (rule (c) unchanged) regardless of stage/launch_mode",
    };
  }
  return ts;
});

const risks = prd.risks.map((r) => {
  if (r.risk.includes('141/171 ventures')) {
    return {
      ...r,
      risk: "CORRECTED (was based on a misreading): the 141/171 is_demo=true ventures are CI/test fixtures (verified by name), and rule (c)'s OUT_OF_SCOPE exemption for them is correct, chairman-commissioned design that must not change. The retained, genuine risk is narrower: rule (e) alone (stage>=24) does not check launch_mode, so a venture whose stage advances past 24 through a path other than the proper go-live authorization would incorrectly pass.",
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: "Add launch_mode='live' as an AND-condition on rule (e) only; leave rule (c) (is_demo) untouched.",
    };
  }
  return r;
});

const { error: updErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs, test_scenarios: testScenarios, risks, updated_by: 'Alpha-2 (EXEC-prep correction, verified live venture data)' }).eq('id', PRD_ID);
if (updErr) { console.error(updErr.message); process.exit(1); }
console.log('FR-2/TS-3/risks corrected: is_demo/rule(c) left untouched; launch_mode AND-condition on rule (e) only.');
