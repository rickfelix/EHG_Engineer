#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- VALIDATION review at LEAD-TO-PLAN.
 *
 * Independent verification of the LEAD package: every file:line citation in
 * metadata.mechanism_verifications and key_changes/risks was re-read directly against the
 * working tree rather than trusted. All 11 mechanism citations verified accurate, including
 * BOTH corrected quiet-hours citations. The readProducingFeederCounts race, the
 * status:'skipped' dual-purpose claim, and the quiet-hours absence all independently
 * confirmed. Five findings raised (one scope-coherence contradiction the correction missed,
 * one substantive under-citation that could ship an INVERTED quiet-hours guard, one
 * smoke-test coverage gap, one snapshot drift, one placeholder field set) -- CONDITIONAL_PASS.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

const SUMMARY = [
  'Independently re-read every cited file:line rather than trusting the package. ALL 11 mechanism citations verified ACCURATE, including both self-corrected quiet-hours citations: lib/comms/adam-outbound/quiet-hours-extension.js:77 is exactly the resolveAllowQuietHours export, and lib/time/chairman-et-wall-clock.js:20-21 is exactly SMS_QUIET_START_HOUR=22 / SMS_QUIET_END_HOUR=6 (the superseded :20-21 attribution on quiet-hours-extension.js is an import line plus a blank line, confirming the original error was real and is now fixed). chairman-et-wall-clock.js:158 = smsQuietWindowReleaseIso, confirmed. The checkpoint-send.mjs citations 113 (inWindow), 127 (enable/disable), 145 (cap), 166 (recipient pin), 181 (identity), 61-74 (summarizeCounts), 76-80 (composeCheckpointBody) all land on what they claim.',
  '(1) THE RACE BUG IS REAL: checkpoint-send.mjs:82-93 readProducingFeederCounts orders by attempt descending and takes rows[0] with NO finished_at and NO status filter -- an in-flight attempt is read as that feeder\'s latest data, exactly as claimed.',
  '(2) THE skipped DUAL-PURPOSE CLAIM IS FULLY CONFIRMED ON BOTH HALVES: lib/michael/feeder.mjs:211 claimAttempt inserts status:skipped with counts.phase=started and started_at set, leaving finished_at NULL (the START placeholder), while RUN_STATUSES (feeder.mjs:80) includes skipped and feeder.mjs:291 passes a run()\'s own skipped through as a FINAL status -- and three live feeders actually do return it as a final outcome (health-sync.mjs:62, oracle-extract.mjs:69, tasks-classifier.mjs:165/168/179). The DDL (database/migrations/20260906_michael_tables.sql:157) CHECKs status IN (ok, degraded, failed, skipped, imported) with NO finished literal, and finished_at is nullable (:161). So the SD\'s conclusion -- finished_at IS NOT NULL is the only unambiguous completion signal, filtering on status alone is wrong -- is correct, and feeder.mjs:304\'s own comment (a finish write the ledger did not hold leaves the row skipped/started) independently corroborates it.',
  '(3) THE QUIET-HOURS GAP IS REAL AND WIDER THAN STATED: zero quiet-hours references in checkpoint-send.mjs, and also zero in lib/messaging/providers/twilio-provider.js, lib/michael/checkpoint-identity.mjs, and across all of scripts/michael plus lib/michael -- nothing in Michael\'s send path enforces it at any layer.',
  'FINDINGS: F1 the correction was applied to scope/key_changes/risks but MISSED strategic_objectives[0], which still lists quiet hours inside "every existing fail-closed guard", directly contradicting corrected scope bullet [2]; F2 metadata.plan_content (hash-pinned) retains the same uncorrected claim; F3 the citations name resolveAllowQuietHours (the OVERRIDE resolver, which returns false when unconfigured) and smsQuietWindowReleaseIso (a release-TIME helper) but never name isSmsQuietHour (chairman-et-wall-clock.js:138), the actual in-window predicate -- an implementer following these citations literally could ship an inverted guard; F4 smoke_test_steps has no quiet-hours step despite it being the only NEW mechanism and the SD\'s only medium-likelihood risk; F5 all five success_criteria measures are the literal string [UNPOPULATED].',
].join(' ');

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 92,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: SUMMARY,
    critical_issues: [],
    warnings: [
      'F1 SCOPE COHERENCE (the residual contradiction): strategic_objectives[0] still reads "...reuses every existing fail-closed guard (recipient pin, identity, enable/disable, daily cap, quiet hours)...". Quiet hours is NOT an existing guard -- corrected scope bullet [2], key_changes[4] and risks[2] all now say it must be NEWLY WIRED. The scope FIELD is internally coherent on its own; the SD as a whole is not, because the correction did not propagate to strategic_objectives. PLAN must not read strategic_objectives[0] as evidence the guard exists.',
      'F3 SUBSTANTIVE UNDER-CITATION (highest-value finding): key_changes[4] and risks[2] cite quiet-hours-extension.js:77 resolveAllowQuietHours plus chairman-et-wall-clock.js:20-21 constants plus :158 smsQuietWindowReleaseIso, but NEVER cite isSmsQuietHour (chairman-et-wall-clock.js:138), which is the predicate that actually answers "am I inside quiet hours". resolveAllowQuietHours is the OVERRIDE resolver (deriveAllowQuietHours, quiet-hours-extension.js:28-33, returns false whenever the extend preference is unset or unparseable) -- using it alone as the guard would be exactly inverted. The canonical correct composition already exists in-repo at scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339: if (!allowQuietHours && isSmsQuietHour(now, chairmanZone)). PLAN\'s FR must cite that two-part shape, and must decide the chairman-zone argument (isSmsQuietHour and resolveAllowQuietHours are both zone-aware; checkpoint-send.mjs currently has no zone concept at all and uses a hardcoded ET via todayEt/etMinuteOfDay).',
      'F4 SMOKE-TEST COVERAGE GAP: smoke_test_steps steps 1-3 are concrete, non-generic and have observable outcomes (they are NOT the auto-generated placeholder). But NO step exercises quiet-hours refusal, even though quiet-hours is the only mechanism being newly wired, is named in success_criteria[3], and carries risks[2] -- the SD\'s ONLY medium-likelihood risk. Step 3 also bundles two distinct assertions (on-demand proceeds outside the window / on-demand still refuses on an invalid guard) into one step.',
      'F5 PLACEHOLDER FIELDS: all five success_criteria[].measure are the literal string "[UNPOPULATED]". The criterion prose is specific and testable, but no measure is populated. metadata.needs_enrichment also still lists key_changes/strategic_objectives/risks even though all three are now richly populated (stale flag).',
      'F2 HISTORICAL SNAPSHOT DRIFT: metadata.plan_content (pinned by metadata.plan_content_hash) still contains the pre-correction line listing "the 22:00-06:00 ET chairman quiet hours" among guards that already apply. Immutable-by-design as a provenance snapshot, so likely correct NOT to edit -- but PLAN reads plan_content, so the stale claim needs an explicit note rather than a silent rewrite.',
    ],
    recommendations: [
      'Fix F1 before the PLAN handoff: remove "quiet hours" from the parenthetical in strategic_objectives[0], or rewrite it as "(recipient pin, identity, enable/disable, daily cap -- plus a newly wired quiet-hours check)". This is a one-field edit and is the only finding that leaves the SD self-contradictory.',
      'Fix F3 in the PRD: add isSmsQuietHour (lib/time/chairman-et-wall-clock.js:138) to the cited mechanism set and specify the guard as the two-part "!allowQuietHours && isSmsQuietHour(now, zone)" composition, citing scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339 as the in-repo precedent. Also decide explicitly whether Michael resolves the chairman zone (resolveChairmanZone / resolveQuietHoursContext at quiet-hours-extension.js:107/:130, the latter being the one-round-trip combined resolver Adam\'s SMS path uses) or pins America/New_York like the rest of checkpoint-send.mjs.',
      'Fix F4: add a 4th smoke step invoking the on-demand path at an ET minute inside 22:00-06:00 with all other guards valid, expecting a refusal with a distinct quiet-hours refusal_code and a ledger row -- and a companion step proving the extend-until preference lets it through. Split step 3\'s two assertions into separate steps.',
      'Populate the five success_criteria[].measure fields, and clear the stale metadata.needs_enrichment entries for key_changes/strategic_objectives/risks.',
      'NAMING-COLLISION WARNING for PLAN/EXEC: grepping /quiet/ under scripts/michael plus lib/michael returns many hits that are ALL the unrelated "quiet tick" health gauge (scripts/michael-quiet-tick.mjs) or a vitest logger stub named quiet -- none are SMS quiet hours. An implementer doing a casual grep could wrongly conclude the guard already exists. The SD\'s zero-hit claim only holds when you grep for quiet-hours specifically.',
      'Precision nit (no action required): key_changes[0] quotes line 113 as the full if-plus-return. Line 113 is only the if(...); the return is at line 116 (a 5-line block with an FR-6 comment). The citation points at the right construct and the return value is verbatim correct -- the quote just compresses the block.',
      'Corroborating context PLAN can rely on: FEEDERS[checkpoint-send].window (lib/michael/feeder.mjs:70) is four 15-minute windows at 06:00/10:00/14:00/18:00 ET and CAP_PER_DAY=4 (checkpoint-send.mjs:46), both exactly as the SD states. The "never falls inside 22:00-06:00 by construction" claim is correct but lands on the boundary: the 06:00-06:15 window has ET hour 6, and isSmsQuietHour is (hour >= 22 || hour < 6), so it escapes by exactly one hour class. Worth an explicit test at 06:00 ET so a future quiet-window widening cannot silently disable the morning fixed-window send.',
    ],
    detailed_analysis: {
      commands_run: [
        'Queried strategic_directives_v2 for sd_key=SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 and read description/scope/key_changes/strategic_objectives/risks/success_criteria/smoke_test_steps/metadata.mechanism_verifications in full',
        'grep -n on scripts/michael/checkpoint-send.mjs lines 58-95 -- verified summarizeCounts at 61-74, composeCheckpointBody at 76-80 (raw asOf interpolation), readProducingFeederCounts at 82-93',
        'Verified readProducingFeederCounts:87 orders by attempt descending and :90 takes read.rows[0] -- no finished_at filter, no status filter: RACE CLAIM CONFIRMED',
        'Spot-printed checkpoint-send.mjs lines 111/112/113/114/116/118/127/145/166/181 -- every cited guard line lands on what key_changes claims (note: the 113 return is actually at 116)',
        'grep -nEi "quiet|SMS_QUIET|22:00|resolveAllowQuiet|nightly|do_not_disturb|dnd" scripts/michael/checkpoint-send.mjs -> ZERO HITS: quiet-hours absence independently confirmed',
        'Widened the absence check: zero quiet-hours hits in lib/messaging/providers/twilio-provider.js and lib/michael/checkpoint-identity.mjs; every /quiet/ hit under scripts/michael plus lib/michael is the unrelated quiet-tick gauge or a test logger named quiet',
        'Read lib/time/chairman-et-wall-clock.js:15-25 -> SMS_QUIET_START_HOUR=22 at :20, SMS_QUIET_END_HOUR=6 at :21: CORRECTED CITATION VERIFIED ACCURATE',
        'Read lib/time/chairman-et-wall-clock.js:150-170 -> smsQuietWindowReleaseIso export at :158: VERIFIED; also found isSmsQuietHour at :138 (hour >= START || hour < END), which the SD never cites -> finding F3',
        'Read lib/comms/adam-outbound/quiet-hours-extension.js:70-95 -> resolveAllowQuietHours export at exactly :77: CORRECTED CITATION VERIFIED ACCURATE; confirmed :20-21 of that file is an import plus a blank line, so the superseded attribution was genuinely wrong',
        'Read deriveAllowQuietHours (quiet-hours-extension.js:28-33) -> returns false when the extend preference is absent or unparseable, i.e. it is an OVERRIDE resolver, not an in-window predicate -> basis for F3 inverted-guard risk',
        'grep -rn for isSmsQuietHour and resolveAllowQuietHours across lib and scripts -> found the canonical two-part composition at scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339',
        'Read database/migrations/20260906_michael_tables.sql:151-173 -> status CHECK IN (ok, degraded, failed, skipped, imported) at :157 (no finished literal), finished_at TIMESTAMPTZ NULL at :161, unique index on (et_date, feeder, attempt) at :169',
        'Read lib/michael/feeder.mjs claimAttempt:198-220 -> :211 inserts status skipped with counts.phase started and started_at set, finished_at left NULL: START-PLACEHOLDER half of the dual-purpose claim CONFIRMED',
        'Read lib/michael/feeder.mjs:80 (RUN_STATUSES includes skipped), :291 (a run() own skipped passes through as final), :302 (the finish write sets status AND finished_at), :304-306 (comment about a finish write the ledger did not hold): FINAL-STATUS half CONFIRMED',
        'grep -rn for a literal status skipped under scripts/michael and lib/michael -> health-sync.mjs:62, oracle-extract.mjs:69, tasks-classifier.mjs:165/168/179 all return it as a legitimate FINAL run() outcome; gmail-triage.test.js:294 shows the start-placeholder shape with finished_at null',
        'Read lib/michael/feeder.mjs:70 -> checkpoint-send window = 06:00-06:15/10:00-10:15/14:00-14:15/18:00-18:15; checkpoint-send.mjs:46 -> CAP_PER_DAY=4: both SD claims confirmed',
        'Re-queried the live row to isolate coherence: strategic_objectives[0] still lists quiet hours among existing guards (F1); metadata.plan_content still carries the uncorrected guard line (F2); all five success_criteria measures are [UNPOPULATED] (F5)',
      ],
      citations_verified: {
        accurate: [
          'scripts/michael/checkpoint-send.mjs:61-74 summarizeCounts',
          'scripts/michael/checkpoint-send.mjs:76-80 composeCheckpointBody',
          'scripts/michael/checkpoint-send.mjs:82-93 readProducingFeederCounts',
          'scripts/michael/checkpoint-send.mjs:113 inWindow check',
          'scripts/michael/checkpoint-send.mjs:127 enable/disable read',
          'scripts/michael/checkpoint-send.mjs:145 same-day cap read',
          'scripts/michael/checkpoint-send.mjs:166 recipient pin read',
          'scripts/michael/checkpoint-send.mjs:181 identity resolution',
          'lib/comms/adam-outbound/quiet-hours-extension.js:77 resolveAllowQuietHours (CORRECTED, verified)',
          'lib/time/chairman-et-wall-clock.js:20-21 SMS_QUIET_START_HOUR/END_HOUR (CORRECTED, verified)',
          'lib/time/chairman-et-wall-clock.js:158 smsQuietWindowReleaseIso',
        ],
        inaccurate: [],
        imprecise: ['scripts/michael/checkpoint-send.mjs:113 -- the quoted return is at :116; the cited construct is correct, the quote compresses a 5-line block'],
        missing_but_needed: ['lib/time/chairman-et-wall-clock.js:138 isSmsQuietHour -- the actual in-window predicate, never cited (F3)'],
      },
      claim_verdicts: {
        readProducingFeederCounts_race: 'CONFIRMED -- orders by attempt desc, rows[0], no finished_at/status filter',
        skipped_dual_purpose: 'CONFIRMED on both halves -- start placeholder (feeder.mjs:211) and legitimate final status (feeder.mjs:80/:291 plus 3 live feeders)',
        quiet_hours_absent: 'CONFIRMED and wider than stated -- absent from checkpoint-send.mjs, twilio-provider.js, checkpoint-identity.mjs and all of scripts/michael plus lib/michael',
        scope_field_coherent: 'YES for the scope field itself; NO at SD level -- strategic_objectives[0] retains the contradicted claim (F1)',
        smoke_steps_concrete: 'YES -- non-generic with observable outcomes, but no quiet-hours step and step 3 bundles two assertions (F4)',
      },
      no_files_modified: true,
      no_migrations_run: true,
    },
    metadata: {
      independent_verification: true,
      citations_checked: 11,
      citations_inaccurate: 0,
      corrected_citations_reverified: ['lib/comms/adam-outbound/quiet-hours-extension.js:77', 'lib/time/chairman-et-wall-clock.js:20-21'],
      findings: ['F1-scope-coherence-strategic-objectives', 'F2-plan-content-snapshot-drift', 'F3-isSmsQuietHour-uncited-inverted-guard-risk', 'F4-no-quiet-hours-smoke-step', 'F5-unpopulated-measures'],
      blocking_for_plan: ['F1', 'F3'],
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/michael-texting-lead-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
