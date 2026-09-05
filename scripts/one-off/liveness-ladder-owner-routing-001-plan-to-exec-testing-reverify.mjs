#!/usr/bin/env node
// Re-verification pass, PLAN-TO-EXEC, SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.
// Original TESTING evidence (06a27f4c-b687-4a12-a387-15eae7629d0d) returned BLOCKED @93 confidence
// with 2 CRITICAL findings (un-ackable DIRECTIVE_KINDS, dead 3-tick timeout mechanism) and 3 HIGH
// findings (recorded_via inconsistency, dismissal-map poisoning, unsatisfiable FR-4 predicate).
// The PRD and all 12 user stories were corrected in place to address every finding; the SAME
// testing-agent instance re-read the corrected PRD/stories directly (not from a summary) and
// confirmed all 10 fixes present and correctly specified with no regressions. This row records
// that re-verified PASS so the PLAN-TO-EXEC gate reads current truth, not the stale BLOCKED row.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001';

const findings = [
  {
    id: 'directive-kinds-registration-fix-confirmed',
    severity: 'INFO',
    summary: 'FR-1/TR-3 now require registering periodic_liveness_owner_directive in lib/fleet/worker-status.cjs DIRECTIVE_KINDS; US-001 carries a dedicated test (TS-11) proving ackability via scripts/worker-ack-directive.cjs. Re-read directly against the current PRD/story rows -- present and correctly specified.',
  },
  {
    id: 'tick-counter-fix-confirmed',
    severity: 'INFO',
    summary: 'FR-1b and US-002 now use climb.count >= LADDER_THRESHOLD + 3, evaluated outside the one-shot climb.laddered gate, reusing climbLadder\'s existing atomic consecutive-miss counter. The rejected read_at/unacked_ticks design is explicitly called out as not-to-use.',
  },
  {
    id: 'decide-ladder-route-seam-confirmed',
    severity: 'INFO',
    summary: 'TR-6 adds an exported pure decideLadderRoute({rawOwner, ownerTarget, climb}) function; US-001 wires it as the seam for TS-1/TS-2/TS-5/TS-6-style unit tests, closing the untestable-tick-loop gap found in the first pass.',
  },
  {
    id: 'live-gate-condition-fix-confirmed',
    severity: 'INFO',
    summary: 'Gate condition corrected to ownerTarget.live===true everywhere (PRD and US-001), with explicit negative tests against the always-truthy broadcast-coordinator sentinel.',
  },
  {
    id: 'recorded-via-unified-confirmed',
    severity: 'INFO',
    summary: 'recorded_via unified to ladder-escalation-advisory across the PRD data_contracts section, FR-2/FR-5, US-004 (writer) and US-011 (predicate) -- the three-way contradiction found in the first pass is resolved.',
  },
  {
    id: 'dismissal-map-poisoning-fix-confirmed',
    severity: 'INFO',
    summary: 'FR-2/TR-4 and US-004 now require a distinct, non-DIGEST_PREFIX summary for the awareness writer plus a dedicated regression test proving it is not read as a dismissal by findRecentlyDismissedSignatures.',
  },
  {
    id: 'not-null-columns-and-loud-failure-fix-confirmed',
    severity: 'INFO',
    summary: 'TR-4/US-004 full insert shape now includes lifecycle_stage:0 and decision_type:advisory (the missing NOT NULL columns from the first draft), plus a requirement that the insert error path log loudly rather than silently swallow.',
  },
  {
    id: 'chairman-label-normalization-fix-confirmed',
    severity: 'INFO',
    summary: 'FR-2/TR-2/US-005 now normalize (trim+lowercase) the raw owner label before matching /^chairman(-fleet)?$/ without a case-insensitive flag, closing the trailing-whitespace false-negative found in the first pass.',
  },
  {
    id: 'fr4-two-registry-predicate-fix-confirmed',
    severity: 'INFO',
    summary: 'US-008 now corrects all three misdeclared rows (okr-day28-hardstop, stage_health, portfolio_review); US-009\'s predicate maps both eva-master-scheduler.js registerJob (numeric cadenceDays) and registerRound (string cadence) shapes to seconds, covering all 18 live scheduler_round rows rather than only the 4 okr-* rows.',
  },
  {
    id: 'fr5-positive-predicate-added-confirmed',
    severity: 'INFO',
    summary: 'FR-5(e)/US-011 adds a positive live predicate (count of session_coordination rows with the registered directive kind since the merge commit, INSUFFICIENT_DATA at zero rather than a false PASS), closing the negative-only-suite gap found in the first pass.',
  },
];

const summary = 'Re-verification pass following a full PRD/user-story correction cycle. All 2 CRITICAL and 3 HIGH findings from the original BLOCKED verdict (06a27f4c-b687-4a12-a387-15eae7629d0d) were addressed with concrete, code-cited fixes; this pass re-read the corrected PRD (PRD-bb4b1b7d-598c-4880-9d6e-186586d020ba) and all 12 user_stories rows directly from the database (not from a summary) and confirmed each fix present, correctly specified, and free of regressions against adjacent, unchanged stories. No remaining CRITICAL/HIGH findings. Verdict revised from BLOCKED to PASS -- ready for PLAN-TO-EXEC.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings: [],
    recommendations: [],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN-TO-EXEC',
      supersedes: '06a27f4c-b687-4a12-a387-15eae7629d0d (BLOCKED @93, pre-correction)',
      re_verification_method: 'Direct re-read of current product_requirements_v2 and user_stories rows (not a summary) by the same reviewing agent instance that raised the original findings',
    },
    phase: 'PLAN-TO-EXEC',
    // Prospective (pre-EXEC) review: no code exists yet, so no tests have run. Honest
    // "nothing to measure yet" declaration per lib/sub-agent-executor/testing-verdict-guard.js's
    // documented exemption -- a well-formed zero test_execution block + metadata.measured:false,
    // never a fabricated tests_executed>0 claim for a design-time review.
    metadata: {
      measured: false,
      test_execution: {
        tests_executed: 0,
        tests_passed: 0,
        tests_failed: 0,
        tests_skipped: 0,
        note: 'Prospective PLAN-phase review of the PRD/user-story testing strategy -- EXEC has not started, no test files exist yet to execute.',
      },
    },
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC', source: 'manual' },
  );

  console.log('TESTING RE-VERIFICATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
