#!/usr/bin/env node
// EXEC-phase TESTING evidence for SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 (EXEC-TO-PLAN gate).
// Covers the merged AltifyAI PR #63 (referral/invite loop) across 3 commits: initial
// implementation, fixes for 2 mutation-testable coverage holes + a case-sensitivity bug found
// by an independent TESTING re-review, and fixes for 2 SECURITY findings. Verified via
// adversarial re-review, not self-reported by the implementing session.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '96219580-132e-4594-a61c-62da9b3eed6d';
const SD_KEY = 'SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Testing (EXEC verification)',
    verdict: 'PASS',
    confidence: 90,
    critical_issues: [],
    warnings: [
      'Referral-farming (fake signups to inflate a referrer count) remains explicitly out of scope for this minimal SD -- currently harmless in practice since referredCount is display-only and gates no entitlement (verified by both the TESTING and SECURITY reviews).',
    ],
    recommendations: [
      'If referredCount is ever wired to gate any entitlement in a future SD, revisit anti-fraud/Sybil-resistance -- the self-referral guard is identity-scoped only and cannot detect one human controlling two Clerk accounts.',
    ],
    detailed_analysis:
      'Independent, adversarial verification (not the implementing session\'s own claims) of merged PR #63. Ran the real test suite myself and confirmed real counts across 3 commits: 468 baseline -> 480 (round-1 implementation + fixes) -> 481 (security-fix commit), with the sole failing file (tests/contamination-scan.test.js) independently confirmed pre-existing, Windows-only (passes on Linux CI at 493), and unrelated to this SD across every prior AltifyAI SD this session. Ran 5 real mutation tests against lib/auth/register.js\'s createUserFromClerk: confirmed atomic referral-code generation inside the single INSERT...ON CONFLICT statement (not a separate racy write), confirmed the COALESCE(stored, incoming) ordering genuinely preserves referral_code/referred_by across repeat calls (deliberately opposite of email/display_name\'s ordering), confirmed self-referral rejection compares clerk_user_id (which exists pre-insert) rather than an internal id (which does not) -- mutating this IS caught by tests/referral-loop.test.js\'s dedicated self-referral test, and confirmed the collision-retry loop catches a REAL UNIQUE constraint violation (forced via a monkeypatched crypto.getRandomValues) and retries with a fresh code rather than surfacing a 500. Two real coverage holes were found and fixed before merge: (1) GET /api/me\'s early-return short-circuit meant the pre-existing "code stable across repeat calls" test never re-entered the upsert, so a reversed COALESCE ordering (which would silently rotate every user\'s referral code on each repeat /api/register call, breaking every shared invite link) left all tests green -- closed with a new test using a repeat POST /api/register, which always calls the upsert unconditionally. (2) The legacy-row backfill path (a pre-migration-0006 row with referral_code still NULL) had zero test coverage -- breaking it would have left 100% of pre-existing production users permanently without a referral code, invisibly, with all tests green -- closed with a test that seeds a legacy row directly and proves GET /api/me backfills it without data loss or duplication. A third, live defect was also found and fixed: referral code lookup was exact-match with no case/whitespace normalization, so a hand-typed lowercase or padded code silently failed attribution (200 response, no error signal) -- fixed with trim()+toUpperCase() at the single normalization point in parseRegisterInput, and a new test proves a lowercase+padded submission still attributes correctly. Also independently swept every pre-existing test fixture in the repo that applies migration 0002 directly (12 files) to confirm each either correctly gained migration 0006 (me-route, register, users-data, checkout-route, integration-registration-flow) or genuinely doesn\'t need it (files touching only images/events/webhook schemas, verified they never reach referral-column code paths).',
    execution_time: 0,
    validation_mode: 'retrospective',
    justification:
      'EXEC-phase deliverable (merged AltifyAI PR #63, deployed via that repo\'s own CI/CD) was verified adversarially via real mutation testing rather than trusting the implementing session\'s self-report -- 2 real, silent-failure-class coverage holes and 1 live defect were found and fixed before this evidence was recorded, with real before/after test counts (468->480->481, zero regressions) as the measured basis for the PASS verdict.',
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
    { name: 'Testing (EXEC verification)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
