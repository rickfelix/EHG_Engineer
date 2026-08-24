#!/usr/bin/env node
// PLAN-phase TESTING evidence for SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- prospective
// design review run BEFORE any EXEC code was written. Measured 5 blocking premise errors in
// the round-1 PRD against the real AltifyAI repo (Workers-incompatible Stripe SDK usage, a
// fabricated "no entitlement field" claim, an unusable PBN pricing-evidence source, a false
// retrofit-SD coordination claim, unautomatable Cloudflare secret provisioning). All 5 were
// resolved via a round-2 PRD/SD revision (see revise-prd-*.mjs and
// sync-sd-fields-*-round2.mjs in this directory) before this evidence was written.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8529c112-3280-4d2b-9620-c3b6a848c55f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Testing (prospective design review)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    critical_issues: [],
    warnings: [
      'Round-2 PRD still requires EXEC to correctly implement the Workers-compatible Stripe SDK path (constructEventAsync + subtle crypto provider + fetch http client) -- a code-time verification step, not something this review can pre-confirm.',
      'Cloudflare deployment/secret provisioning remains genuinely blocked pending human-provisioned Workers-scoped credentials; EXEC must not attempt to silently work around this.',
    ],
    recommendations: [
      'Write the webhook signature fixture test FIRST (Web-Crypto-signed payload, valid + invalid) before wiring the route, so the Workers-runtime SDK mismatch (constructEvent vs constructEventAsync) surfaces immediately rather than only at live-deploy time.',
      'Add the plan_tier CHECK constraint migration early, before the webhook handler is wired, so entitlement-flip tests exercise real constraint enforcement from the start.',
    ],
    detailed_analysis:
      'Prospective review (before any EXEC code written) measured the round-1 PRD against the real AltifyAI repo, the real SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 PRD, and this environment\'s actual Cloudflare/wrangler credential state -- not just PRD prose. FINDING 1 (FALSE): FR-4 claimed no entitlement field exists; users.plan_tier already exists in migrations/0002_create_users_table.sql, already written at registration (lib/auth/register.js:112), already read (src/data/users.js:23), pinned by 8 existing tests -- a new column would create dual representation. FINDING 2 (UNVERIFIABLE/FALSE): FR-1s PBN pricing-evidence premise -- measured venture_pbn_status returns PBN_NOT_SCORED for AltifyAI, and PBN is a pass/park merit verdict with no numeric/price dimension at all. FINDING 3 (FALSE): FR-5s claimed coordination with SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 -- read that SDs actual current PRD directly; its scope is entirely recordGateAttempt()/eva_stage_gate_attempts source-tagging, zero revenue/ledger/launch_mode content. No revenue-ledger table exists anywhere in the portfolio either (probed with real selects, not head:true). FINDING 4 (self-contradiction): FR-2 forbade reading EHG_Engineers Stripe key while implicitly requiring it as the only credential source available. FINDING 5 (Workers-runtime incompatibility): TR-3 specified stripe.webhooks.constructEvent(), which requires synchronous node:crypto; measured wrangler.toml has no nodejs_compat flag, so this throws at runtime -- corrected to constructEventAsync() + Stripe.createSubtleCryptoProvider() + Stripe.createFetchHttpClient(). ADDITIONAL MEASURED FINDING: wrangler is unauthenticated in this environment (wrangler whoami fails; no Workers-scoped CLOUDFLARE_API_TOKEN; AltifyAI CI has no deploy step) -- actual secret provisioning/deployment cannot be executed by EXEC and was carved out as a documented human-action follow-up rather than a silent failure or a silently dropped requirement. ALL FIVE findings plus the credential gap were addressed in a round-2 PRD revision (functional_requirements/technical_requirements/risks/test_scenarios/smoke_test_steps all rewritten) and a matching SD-level rescope (description/success_criteria/strategic_objectives/metadata.rescope_note_round2) before this evidence was recorded. CONDITIONAL_PASS reflects that the corrected design is now measured-accurate against real code/config, with the remaining conditions being EXEC-time implementation fidelity (must actually use the Workers-compatible SDK calls as specified) rather than open design questions.',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'A prospective review before EXEC caught 5 blocking premise errors that would otherwise have surfaced only mid-implementation (a runtime-throwing SDK call, a fabricated field-does-not-exist premise, an unusable pricing-evidence source, a false cross-SD coordination claim, and an unautomatable deployment step) -- matching this sessions established discipline of reviewing PLAN-phase design against measured reality before code is written. All findings were resolved via PRD/SD revision prior to this evidence being recorded, so PLAN-TO-EXEC may proceed against the corrected round-2 scope.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'TESTING',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_UUID,
    { name: 'Testing (prospective design review)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
