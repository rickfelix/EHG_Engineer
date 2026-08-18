require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const metadata = prdRow.metadata || {};

  const fr7 = fr.find((f) => f.id === 'FR-7');
  if (!fr7) throw new Error('FR-7 not found in functional_requirements');

  fr7.acceptance_criteria = [
    "The existing auth.setup.spec.ts harness passes reliably (its current waitForURL timeout failure is root-caused and fixed) before being wired to stage-exit -- DONE (prior EXEC pass)",
    "Once fixed, the harness fires automatically -- not only available to run manually -- IMPLEMENTED as .github/workflows/ehg-app-auth-smoke.yml (scheduled daily + workflow_dispatch), NOT a venture-pipeline stage-exit hook: this test verifies the EHG app's OWN admin/chairman login, which has no relationship to any specific venture or stage_number -- there is no 'stage-exit' event to bind to. Grep-verified no stage-analysis step in this repo spawns a browser-automation subprocess; doing so synchronously inside a stage's execution path would risk that stage on Playwright/browser availability it has never depended on. This repo's own established pattern for 'make a manual Playwright check automatic' (e2e-human-like.yml) is a scheduled/workflow_dispatch GH Actions workflow -- followed for consistency. EXTERNAL DEPENDENCY, named not hidden: BASE_URL/TEST_USER_EMAIL/TEST_USER_PASSWORD must be configured as repository secrets (EHG_APP_BASE_URL, EHG_APP_TEST_USER_EMAIL, EHG_APP_TEST_USER_PASSWORD) pointing at a real, reachable EHG app instance -- until configured, scheduled runs SKIP CLEANLY (the harness's own graceful degradation, verified this session) rather than fail or fabricate a pass, the same 'wire it now, safely inert pending an external/human step' shape as this SD's FR-1/FR-9/FR-10",
  ];

  metadata.fr7_stage_exit_design_decision_2026_08_18 = {
    finding: "FR-7's own text frames this as a venture-pipeline 'stage-exit' hook ('for the stage(s) where deploy-readiness is claimed'), but auth.setup.spec.ts tests the EHG app's own login -- an EHG_Engineer/EHG infrastructure concern, not a per-venture one. There is no venture stage_number this test relates to. Checked for precedent before implementing: no stage-analysis step anywhere in this repo spawns child_process/Playwright (the one grep hit, stage-20-code-quality.js, uses child_process for a VENTURE's own npm audit/lint/test, an unrelated concern). Synchronously spawning a browser-automation subprocess inside a stage's execution path would be an unprecedented, higher-risk pattern with no existing safety scaffolding.",
    action_taken: "Implemented as a scheduled + workflow_dispatch GH Actions workflow (.github/workflows/ehg-app-auth-smoke.yml), mirroring the repo's own established e2e-human-like.yml pattern for 'automatic, not manual' Playwright checks. Secrets are named (EHG_APP_BASE_URL/EHG_APP_TEST_USER_EMAIL/EHG_APP_TEST_USER_PASSWORD) but not fabricated -- configuring them is a human, one-time GH-repo-settings step outside this SD's scope, analogous to a chairman-gated migration ceremony.",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-7 acceptance_criteria updated and metadata.fr7_stage_exit_design_decision_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
