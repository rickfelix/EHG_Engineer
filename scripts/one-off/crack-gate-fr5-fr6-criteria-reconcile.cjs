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

  const fr5 = fr.find((f) => f.id === 'FR-5');
  if (!fr5) throw new Error('FR-5 not found');
  fr5.acceptance_criteria = [
    "A checker exists (lib/venture-deploy/config-completeness.js: checkDeployConfigCompleteness + the pure scanTomlForPlaceholders/isPlaceholderValue helpers) that correctly detects a required config value that never reached its real, non-placeholder form (e.g. the exact AltifyAI database_id scaffold placeholder 00000000...) -- verified live against a real wrangler.toml fixture on disk, not just a string literal",
    "REVISED, PRD/code mismatch reconciled (PLAN-VERIFY review): the ORIGINAL criteria described a build-time fail-loud gate ('the artifact is considered deployable', 'the check fails LOUD (build fails)') -- this was NEVER accurate to what shipped and is corrected here rather than left silently contradicting the description field. checkDeployConfigCompleteness has ZERO production callers by deliberate design (see description's SCOPE NOTE): wiring it into lib/venture-deploy/publish.js alone would not have caught the actual AltifyAI incident (that venture shipped via a hand-run CI workflow in its own repo, never touching this pipeline -- the same wrong-chokepoint risk FR-4 had to navigate). This FR delivers a standalone, tested, importable checker ready for either (a) an EHG_Engineer-side pipeline hook once a venture DOES route through it, or (b) a venture-template CI step ventures could adopt directly -- which is correct is an explicit follow-up scoping decision, not resolved by this SD",
    "FR-6's account-prerequisites.js reuses this module's scanner (TR-5) rather than duplicating its own regex -- confirmed by code review",
  ];

  const fr6 = fr.find((f) => f.id === 'FR-6');
  if (!fr6) throw new Error('FR-6 not found');
  fr6.acceptance_criteria = [
    "REVISED, PRD/code mismatch reconciled (PLAN-VERIFY review): the ORIGINAL criterion required sourcing from venture_provisioning_state -- the description's own EXEC-PHASE FINDING already established this was a wrong assumption (peer-research-confirmed: venture_provisioning_state's real writer, lib/eva/bridge/provisioning-state.js + venture-provisioner.js's DEFAULT_STEPS step-machine, has NO account-level-prerequisite steps at all -- this genuinely IS new plumbing, not a wiring job). The delivered checklist (lib/eva/bridge/account-prerequisites.js: buildAccountPrerequisiteChecklist pure function + resolveAccountPrerequisiteIndicators I/O resolver) is instead sourced from what IS DB/filesystem-observable: applications.metadata.billing_product_id (Stripe), ventures.stack_descriptor.connection (Cloudflare deploy-target routing), ventures.metadata.sentry.dsn, and a local clone's wrangler.toml (D1 placeholder, reusing FR-5's scanner) -- a materially different, honestly-scoped source than the criterion as originally written",
    "A venture's account-prerequisite checklist is queryable/visible (callable) before its first deploy attempt -- as a standalone, non-blocking function, not (yet) wired into any specific pipeline stage or DEFAULT_STEPS entry (deliberately: wiring it as a blocking provisioning step would risk breaking in-flight venture provisioning, an explicit scope decision, not an oversight)",
    "Failing/missing prerequisite checks are surfaced as a single consolidated list (not discovered one round-trip at a time) -- DONE, with a 3-state present:true/false/null distinction (true=confirmed present, false=confirmed missing, null=not checkable from this DB alone, e.g. Clerk auth keys, named explicitly in the checklist output rather than silently omitted) rather than collapsing unchecked into missing",
  ];

  metadata.fr5_fr6_criteria_reconciliation_2026_08_18 = {
    finding: "PLAN-VERIFY VALIDATION sub-agent review found FR-5 and FR-6's acceptance_criteria still described the ORIGINAL, pre-investigation design (a build-time fail-loud gate for FR-5; venture_provisioning_state as the FR-6 source) even though both FRs' own description fields already document, in detail, why that design was corrected during EXEC (wrong-chokepoint risk for FR-5; a wrong-table assumption, peer-confirmed, for FR-6). Unlike FR-1/FR-2/FR-3/FR-7/FR-9/FR-10, these two criteria fields were never updated to match -- the only two FRs where this drift occurred, confirming it is confined to these two rather than systemic.",
    action_taken: "Rewrote both FRs' acceptance_criteria to state what was actually, deliberately delivered and why -- matching the pattern already applied to every other corrected FR in this PRD.",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-5 and FR-6 acceptance_criteria reconciled; metadata.fr5_fr6_criteria_reconciliation_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
