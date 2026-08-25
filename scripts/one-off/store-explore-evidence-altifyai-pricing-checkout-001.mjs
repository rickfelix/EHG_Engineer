#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001. The SD's
// as-submitted premise overstates existing infrastructure on 3 counts -- see
// detailed_analysis below. Written before re-scoping the SD's DB record.
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
    sub_agent_name: 'Explore (premise verification)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    critical_issues: [],
    warnings: [
      'SD premise overstates existing infrastructure on 3 counts: fabricated Stripe pattern citation, non-existent entitlement machinery, unprovisioned Stripe secrets',
    ],
    recommendations: [
      'Re-scope to strike the false "existing Stripe pattern" citation, add explicit Stripe secret provisioning as its own FR, add explicit minimal entitlement/tier field build-out for FR-3 (no flip-switch exists to flip)',
    ],
    detailed_analysis:
      'MEASURED, not assumed, against the actual AltifyAI repo (C:/Users/rickf/Projects/_EHG/altifyai, a separate ' +
      'Cloudflare Worker app, not EHG_Engineer). (a) CONFIRMED TRUE: no payment path exists -- zero matches for ' +
      '"stripe"/"checkout"/"pricing"/"webhook" across src/, lib/, scripts/, migrations/; no stripe dependency in ' +
      'package.json; no api/ directory besides a feedback client. Auth is genuinely live (Clerk, ' +
      'src/auth/clerk.js), fixed by 2 completed SDs 08-17. (b) FABRICATED: the cited "existing Stripe webhook ' +
      'posture in api/webhooks/stripe.js" does not exist anywhere in the portfolio -- searched the AltifyAI repo, ' +
      'apexniche-ai (the cited structural model), and the main ehg platform repo (app/api/webhooks/ has only a ' +
      'github webhook route). No evidence this file ever existed; this is a false citation, not a stale one. (c) ' +
      'ALSO UNCONFIRMED/LIKELY FALSE: FR-3s "usage-panel machinery is live" claim -- zero matches for ' +
      '"usage.panel"/"entitlement"/"tier.limit"/"usageLimit" anywhere in the repo. No tier/entitlement system ' +
      'exists to hook a payment flip into; this is greenfield build-out, not a flip-switch. FR-1s "PBN scoring ' +
      'evidence" for price-point proposal -- zero matches for "pbn" in the repo; if it exists it is DB-side only ' +
      'and must be verified before proposing a price, not assumed ready to hand. (d) Stripe secret provisioning: ' +
      'no STRIPE_WEBHOOK_SECRET anywhere; only a STRIPE_TEST_* key name visible, and that is in EHG_Engineers own ' +
      'dotenv context, NOT the AltifyAI Workers own wrangler secret store (which is where it would actually need ' +
      'to live for the deployed app to use it). Getting real Stripe keys (test + live) provisioned into the ' +
      'AltifyAI Workers secrets is an unstated prerequisite this SD would otherwise silently block on mid-EXEC. ' +
      '(e) The retrofit SD dependency (FR-4s coordination point) IS real and current: ' +
      'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 is status=active, phase=EXEC (in progress), with an ' +
      'Adam-amended FR-5 to flip AltifyAIs launch_mode/launched_at fields from measured live-state evidence -- ' +
      'this sequencing note in the plan is accurate, not stale. CONCLUSION: the core premise (payment path must ' +
      'be built) is directionally correct and the sequencing dependency is real, but 3 of the 5 original FRs rest ' +
      'on infrastructure that does not exist (a fabricated pattern to "follow", an entitlement flip-switch that ' +
      'is not built, and unprovisioned production secrets) -- re-scope needed before PLAN to reflect this is ' +
      'greenfield Stripe integration work, not "wire up an existing pattern."',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'SD as submitted cited an existing Stripe webhook pattern and live entitlement machinery as build-on-top ' +
      'infrastructure; measured reality shows neither exists, and Stripe secrets are unprovisioned in the actual ' +
      'deploy target -- the SD record needs re-scoping to greenfield-integration framing before PLAN work ' +
      'proceeds, matching this sessions established pattern of re-scoping to match reality rather than building ' +
      'to a stated-but-unverified premise.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'EXPLORE',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_UUID,
    { name: 'Explore (premise verification)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
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
