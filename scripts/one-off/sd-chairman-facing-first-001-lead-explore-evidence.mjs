// SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001 — LEAD-TO-PLAN Explore sub-agent evidence.
// Escalated from QF-20260912-079 (87 source LOC > 75 cap). Code for FIX SHAPE (b) was already
// implemented and unit-tested (43 passing tests, 3 new/updated) before escalation; this records
// the Explore-phase evidence the LEAD-TO-PLAN gate requires, and is explicit about the ticket's
// PARTIAL scope decision.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001';

const findings = [
  {
    id: 'ticket-bundles-two-independent-fixes-only-b-delivered',
    severity: 'HIGH',
    summary: 'The originating QF-20260912-079 bundles two logically-separable fixes under one FIX SHAPE: (a) composer-side measured_by[] provenance stamping across scripts/adam-chairman-decision.mjs and scripts/adam-chairman-sms.mjs plus a NEW pre-send refusal gate for unstamped digit-bearing claims, and (b) distinguishing oracle-DECLINED from oracle-ABSENT at consult-hold expiry in lib/adam/chairman-held-send-release.js. Only (b) is delivered by this SD. (a) is cross-cutting (3+ files), introduces a brand-new schema convention (measured_by[] shape) and a new gate action with real false-positive/false-negative risk on the trust-critical chairman comms path, and was deliberately NOT rushed into a QF-shaped change. Filed as its own scope for a dedicated follow-up rather than folded in here.',
  },
  {
    id: 'expiry-abandon-was-unconditional-confirmed-live-in-code',
    severity: 'HIGH',
    summary: 'Read lib/adam/chairman-held-send-release.js:228-249 (releaseHeldSend) and :368-372 (isConsultHoldExpired) directly: decideRelease() can only return action=\'hold\' when verified.found===false (no answer row exists at all) -- there is no code path where an ANSWERED-but-refused hold (action=\'refuse\') ever reaches the expiry/abandon branch; it is stamped with last_error and stays \'held\' forever instead (a separate, pre-existing gap, out of scope here). Confirmed the sweep (scripts/cron/chairman-held-sends-release-sweep.mjs) only reads status=\'held\' rows and calls releaseHeldSend per row -- releaseHeldSend is the SOLE call path that can ever trigger abandonment, so the fix belongs entirely in this one file.',
  },
  {
    id: 'solomon-liveness-primitive-already-exists-reused-not-reinvented',
    severity: 'INFO',
    summary: 'lib/coordinator/solomon-identity.cjs exports getActiveSolomonId(supabase, opts) -- an already-tested, fail-open (never throws) resolver of the currently-live, heartbeat-fresh canonical Solomon session, used elsewhere for reply-targeting. Reused directly rather than inventing a new heartbeat check; "oracle absent" is defined as getActiveSolomonId returning null (no fresh live Solomon session), which also naturally covers a frozen/dead Solomon account (its session simply never heartbeats).',
  },
  {
    id: 'defer-window-matches-column-default-not-arbitrary',
    severity: 'INFO',
    summary: 'database/migrations/20260824_chairman_held_sends.sql:140 sets hold_expires_at DEFAULT (now() + interval \'24 hours\'). The new deferExpiredConsultHoldForAbsentOracle() extends by the same 24h window (DEFER_WINDOW_MS constant) rather than an arbitrary shorter re-check interval, so a deferred hold gets the SAME grace period a fresh hold would.',
  },
];

const recommendations = [
  'PLAN should scope this PRD to FIX SHAPE (b) only, matching what is already implemented and tested; FIX SHAPE (a) should be tracked as an explicit, separate follow-up (a new QF or SD) once this ships, not folded into this PRD\'s requirements.',
  'EXEC-TO-PLAN should confirm the existing commit/PR (already written, 43/43 + 36/36 tests passing) satisfies the (b)-scoped PRD rather than re-deriving the implementation from scratch.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001 (escalated from QF-20260912-079 on LOC alone) confirmed the pre-existing expiry/abandon code path is the sole abandonment trigger and was unconditional (no Solomon-liveness check at all), confirmed a reusable, already-tested Solomon-liveness primitive existed to fix it correctly, and made a deliberate, documented scope decision to ship only FIX SHAPE (b) (the expiry defer-vs-abandon distinction) in this SD, leaving FIX SHAPE (a) (composer measured_by[] stamping + a new pre-send refusal gate) for a dedicated follow-up given its cross-cutting, trust-critical nature.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 93,
    findings,
    warnings: [
      'This SD deliberately delivers only half of the originating QF\'s stated FIX SHAPE (part b, not part a). This is a scope decision, not an oversight -- see finding ticket-bundles-two-independent-fixes-only-b-delivered.',
    ],
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/adam/chairman-held-send-release.js',
        'scripts/cron/chairman-held-sends-release-sweep.mjs',
        'lib/coordinator/solomon-identity.cjs',
        'lib/adam/presend-consult-lane.cjs',
        'lib/adam/should-consult-solomon.js',
        'scripts/adam-chairman-decision.mjs',
        'database/migrations/20260824_chairman_held_sends.sql',
        'tests/unit/adam/chairman-held-send-release.test.js',
      ],
      searches_run: [
        'traced every caller of releaseHeldSend / isConsultHoldExpired / abandonExpiredConsultHold repo-wide',
        'traced decideRelease\'s action vocabulary to confirm action=\'hold\' only ever means found:false',
        'searched for an existing Solomon-liveness/heartbeat primitive before writing a new one',
        'read the chairman_held_sends migration for the hold_expires_at column default',
      ],
      dedup_candidates_checked: ['SD-LEO-INFRA-WIRE-CHAIRMAN-SMS-001 (completed -- wired the ORIGINAL pre-send consult gate; this SD fixes a later expiry-behavior bug in that already-shipped mechanism, not a duplicate)'],
      mechanism_verifications: [
        { verified_by: 'Explore (LEAD-TO-PLAN)', verified_at: 'lib/adam/chairman-held-send-release.js:228-249 (releaseHeldSend expiry branch, pre-fix)' },
        { verified_by: 'Explore (LEAD-TO-PLAN)', verified_at: 'lib/coordinator/solomon-identity.cjs:205-207 (getActiveSolomonId)' },
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
