#!/usr/bin/env node
// EXEC-phase SECURITY evidence for SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 (EXEC-TO-PLAN gate).
// Records the real security-agent review of merged AltifyAI PR #63 (CONDITIONAL_PASS, findings
// SEC-DL-03/07/08) plus confirmation that SEC-DL-03/07 were fixed and merged before this
// evidence was written. SEC-DL-08 (target_application ambiguity) is a process finding, not a
// code defect -- routed to completion-flags rather than an ad-hoc DB change, matching the same
// caution already exercised for SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001.
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
    sub_agent_name: 'Security (referral loop review)',
    verdict: 'PASS',
    confidence: 90,
    critical_issues: [],
    warnings: [
      'Referral-farming (Sybil via multiple Clerk accounts held by one human) is real and confirmed empirically (a probe successfully attributed sockA->sockB across two distinct Clerk identities), but has zero reward path today -- referredCount is display-only and plan_tier is written only by the Stripe webhook. Documented trigger condition: revisit the moment referredCount ever gates any entitlement.',
      'No rate-limiting exists anywhere in this API (confirmed app-wide, not unique to this feature) -- the referral-code enumeration oracle this SD closed (SEC-DL-03) was already computationally infeasible at 32^8 code space even before the fix; the fix removes the oracle as defense-in-depth, not because it was practically exploitable.',
    ],
    recommendations: [
      'When a public referral landing page (?ref=CODE, auto-submitting) is eventually built, treat the referral code as an attacker-controllable input at that point -- it is currently safe only because no UI surface consumes it yet.',
    ],
    detailed_analysis:
      'A real security-agent review (not a rubber-stamp) measured the merged AltifyAI referral-loop code against 6 concrete threat classes, running actual payloads through the real code path (not just reading it) via a live node:sqlite-backed probe matching the DbClient contract. CONFIRMED PASS: (1) SQL injection -- 6 injection payloads fired through the real referral-code lookup and countReferredUsers query all returned safe results (0 attributions, table intact, count queries correctly scoped), proving genuine parameterization, not just source-text inspection. (2) Enumeration -- confirmed a REAL oracle exists (POST /api/register\'s response distinguished hit-vs-miss via referred_by presence, and misses did not lock the account) but is computationally infeasible (32^8 ≈ 1.1e12 space; ~1.1e9 expected guesses per hit even at only 1000 users, each requiring a valid JWT and a full Worker round-trip) -- correctly assessed as low-priority given rate-limiting is a confirmed pre-existing app-wide gap, not unique to this feature. (3) Cross-user exposure via GET /api/me -- confirmed impossible; every read binds a principal-derived identity, no route accepts a caller-supplied user id. (4) Self-referral -- confirmed the identity-scoped guard holds for same-Clerk-account resubmission (verified empirically); confirmed Sybil (two Clerk accounts, one human) is NOT prevented, but is a documented, PRD-recorded limitation with zero reward path today (referredCount is display-only). REAL FINDINGS, both fixed before this evidence was recorded: SEC-DL-03 (LOW) -- POST /api/register\'s response spread the raw upserted row via SELECT *, leaking the REFERRER\'s internal ULID (which decodes to that other user\'s real account-creation timestamp -- the exact leak class register.js\'s own referral-code design deliberately avoids) and doubling as the enumeration oracle in finding 2; fixed with an explicit response-field allowlist, verified via a new test proving the leaked fields never appear in the response while attribution still genuinely persists at the DB layer. SEC-DL-07 (LOW) -- GET /api/me returned a per-user referral code with no cache-control directive despite the repo already having an unused noStoreHeaders() helper; fixed by applying it. SEC-DL-08 (MEDIUM, process, not a code defect) -- this SD\'s target_application field says EHG_Engineer while all its code lives in the AltifyAI repo; noted but deliberately NOT changed ad-hoc given the exact same caution already exercised for SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 (SUB_AGENT_REPO_RESOLUTION\'s full cross-repo semantics were not fully understood there either, and changing target_application now would retroactively make this SD\'s OWN earlier LEAD-phase evidence rows -- already stamped and gate-passed against EHG_Engineer -- inconsistent instead of fixing anything). Routed to completion-flags as a documented follow-up investigation rather than an ad-hoc fix.',
    execution_time: 0,
    validation_mode: 'retrospective',
    justification:
      'A real SECURITY sub-agent review of user-identity-adjacent code (not a rubber-stamp) ran actual injection/enumeration/cross-user-exposure probes against the live code path rather than reading source alone, found 2 real low-severity leaks and fixed both before this evidence was recorded, and correctly distinguished a genuinely out-of-scope limitation (Sybil/referral-farming, zero reward path today) from something requiring an immediate fix.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'SECURITY',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_UUID,
    { name: 'Security (referral loop review)' },
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
