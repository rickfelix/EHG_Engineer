#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- TESTING evidence at PLAN-TO-EXEC.
 *
 * PLAN-phase TEST-PLAN FALSIFICATION (before any implementation code is written). The job was
 * not to write tests but to find gaps in the test plan itself. 12 gaps found, all closed by an
 * additive PRD amendment (scripts/one-off/michael-texting-plan-to-exec-prd-amend.mjs):
 * technical_requirements 3 -> 11, test_scenarios 12 -> 20, acceptance_criteria 6 -> 10, plus
 * TESTING-PIN acceptance criteria on FR-1/FR-2/FR-4/FR-5.
 *
 * checkpoint-send.mjs itself is UNTOUCHED -- EXEC has not started.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    phase: 'PLAN-TO-EXEC',
    execution_time_ms: 0,
    summary: "PLAN-phase test-plan falsification for the Michael on-demand checkpoint-texting SD. The handed-over plan (FR-1..FR-5, TR-1..TR-3, TS-1..TS-12, all 12 scenarios typed 'unit') would have let EXEC ship a fully green unit suite over a verb that fails on its first real on-demand invocation. Three findings are of that severity. (1) THE UNIT TIER CANNOT SEE THE BUG BEING FIXED: scripts/michael/checkpoint-send.test.js's fakeSb answers reads by applying ONLY `eq` operations -- .order(), .not(), .is() and .limit() are recorded into `ops` and then discarded. readProducingFeederCounts's `.order('attempt', {ascending:false})` is therefore a no-op in every existing test, and TS-1 as written is either vacuous (fixture order decides the pass) or inverted (a CORRECT query-level `.not('finished_at','is',null)` implementation would FAIL the unit test while being right in production). The plan did not say which implementation shape to use, so either outcome was reachable. (2) A LATENT REPLACEMENT BUG: readProducingFeederCounts reads `{select: 'counts,finished_at,status'}` -- `attempt` is NOT in the select list. Ordering by a non-selected column is legal in Postgres but yields `undefined` on the returned JS objects, so the in-JS max-by-attempt the fix requires would compare undefined on every row and silently degrade to 'whatever row came back first' -- swapping the ordering bug for a fresh nondeterminism bug wearing the fix's clothes. (3) A HARD PRODUCTION FAILURE INVISIBLE TO EVERY MOCKED TEST: windowIdFor (lib/michael/feeder.mjs:112-119) returns **null** when the minute falls in no window, which is the defining condition of the on-demand path, while michael_checkpoint_send_ledger.window_slot is TEXT NOT NULL (20260914_michael_checkpoint_send.sql:36). Branching around the inWindow early-return without substituting a non-null slot makes EVERY on-demand ledger write a NOT NULL violation; fakeSb does not enforce NOT NULL, so TS-5..TS-9 and TS-12 would all pass green. Beyond those: the on-demand slot VALUE was left unpinned ('on-demand' or a timestamped variant, TR-2) and the bare-constant branch silently caps on-demand at ONE send/day (the app-level dedup at :157 refuses the second, and the partial unique index on (et_date, window_slot) WHERE outcome='sent' would reject it at finalize as LEDGER_FINALIZE_RACE_LOST for a text that was actually delivered) -- making FR-1's 'counts toward the same 4/day cap' unreachable, with no scenario covering a mixed fixed-window + on-demand accumulation. FR-5 names resolveAllowQuietHours but quotes the two-variable expression isSmsQuietHour(now, chairmanZone) that resolver cannot supply; the live precedent it cites (chairman-hourly-heartbeat-backstop-sweep.mjs:75/:311/:322/:339) actually uses the BATCHED resolveQuietHoursContext, and using the single-key resolver would leave chairmanZone undefined and silently discard the chairman's configured notifications.timezone. runCheckpointSend has NO injection point for either resolver and they construct a real ChairmanPreferenceStore -> real Supabase client, so TS-9/TS-10/FR-5-AC3 were not runnable at the unit tier at all. Guard ORDER was never pinned: FR-1's prose enumerates quiet-hours LAST, after the :195 staged-ledger write -- implemented literally, the verb stages a SEND_IN_PROGRESS row (which counts against the 4/day cap under SEC-H2) and only THEN refuses, permanently burning a cap slot on a refusal, and TS-9/TS-10 pass in isolation under either ordering. TS-4's threshold '(or simply differ)' is unfalsifiable and operationally wrong -- the three producing feeders run at 04:00/04:30/04:45 ET so their finished_at values essentially always differ, firing the disclosure on every send. FR-1's `--reason` has no destination: the ledger has no free-text column and adding one is a chairman-gated migration outside scope. All 12 gaps are closed in the PRD: TR-4..TR-11 added, TS-1/TS-4/TS-12 rewritten to be discriminating (TS-1 now specifies the adversarial fixture: in-flight row at the HIGHER attempt, finished row at the LOWER attempt, in-flight listed FIRST -- all three properties load-bearing), TS-13..TS-20 added, and TS-20 retiered to `db` as the only scenario a fully-mocked unit test cannot prove. Verdict is CONDITIONAL_PASS, not PASS: the plan as handed over could not have caught its own three highest-severity defects, and the closures are now specification that EXEC must actually honour rather than behavior already proven.",
    critical_issues: [
      {
        id: 'G-1',
        severity: 'CRITICAL',
        issue: "WRONG TEST TIER / UNTESTABLE AS SPECIFIED: scripts/michael/checkpoint-send.test.js's fakeSb answers reads with `(tables[table]||[]).filter(r => every eq matches)` -- every other recorded operation (.order, .not, .is, .limit) is pushed into `ops` and never applied. readProducingFeederCounts's `.order('attempt',{ascending:false})` is a no-op in the entire existing suite. TS-1 therefore cannot discriminate a fixed implementation from an unfixed one: it passes or fails on fixture array order. Worse, the two plausible implementations invert the result -- a query-level `.not('finished_at','is',null)` (correct in production) returns ALL rows through the fake and FAILS TS-1, while an in-JS filter passes.",
        evidence: 'scripts/michael/checkpoint-send.test.js:15-41 (fakeSb proxy: only `eq` ops feed the filter). checkpoint-send.mjs:87 (.order call). The file already documents the correct convention at checkpoint-send.mjs:143-144.',
        resolution: "CLOSED via PRD amendment: FR-2 TESTING-PIN mandates in-JS selection over an unfiltered read (citing the file's own :143-144 precedent); TR-7 documents the fake's eq-only behavior and its two consequences; TR-8 specifies the predicate and tiebreak; TS-1 rewritten with an adversarially ordered fixture.",
      },
      {
        id: 'G-2',
        severity: 'CRITICAL',
        issue: "LATENT REPLACEMENT BUG: readProducingFeederCounts reads `{ select: 'counts,finished_at,status' }` -- `attempt` is absent from the select list. ORDER BY on a non-selected column is legal in Postgres, but the returned JS objects have no `attempt` property. The in-JS max-by-attempt that G-1's closure requires would compare `undefined` on every row, the comparison always false, and selection silently degrades to 'whatever row Postgres returned first' -- replacing the ordering bug with a different nondeterminism bug that looks identical from the outside. This is the single most likely way for the SD to ship green tests over an unfixed verb.",
        evidence: 'scripts/michael/checkpoint-send.mjs:85-89 (select string vs the order clause on the same call).',
        resolution: 'CLOSED via PRD amendment: TR-9 requires widening the select list to include `attempt`; FR-2 TESTING-PIN and TS-1 both require a test asserting it (recorded select string, or the adversarial fixture).',
      },
      {
        id: 'G-3',
        severity: 'CRITICAL',
        issue: "NO STATED MECHANISM, HARD PRODUCTION FAILURE, INVISIBLE TO EVERY MOCKED TEST: windowIdFor(minuteOfDay, windowConfig) returns **null** when the minute falls in no window -- the defining condition of the on-demand path -- and michael_checkpoint_send_ledger.window_slot is TEXT NOT NULL. checkpoint-send.mjs:118 computes windowSlot from windowIdFor immediately after the inWindow gate, so branching around that gate without substituting a non-null slot makes every on-demand ledger write (quiet-hours refusal, DISABLED held, CAP_EXCEEDED, pin/identity refusals, and the staged SEND_IN_PROGRESS row) a NOT NULL violation in production. fakeSb enforces no column constraints, so TS-5, TS-6, TS-7, TS-8, TS-9 and TS-12 would all report green.",
        evidence: 'lib/michael/feeder.mjs:112-119 (windowIdFor returns null off-window). database/migrations/20260914_michael_checkpoint_send.sql:36 (window_slot TEXT NOT NULL). scripts/michael/checkpoint-send.mjs:118.',
        resolution: 'CLOSED via PRD amendment: TR-4 states the failure mode explicitly; TR-5 pins the substitute value; TS-12 rewritten to assert the non-null value shape rather than merely that a write occurred; TS-20 added at the `db` tier as the only instrument that can prove the NOT NULL and unique-index behavior.',
      },
      {
        id: 'G-4',
        severity: 'HIGH',
        issue: "UNPINNED VALUE SILENTLY CAPS ON-DEMAND AT 1/DAY, AND NO SCENARIO COVERS THE MIXED CAP: TR-2 left the on-demand window_slot as \"e.g. 'on-demand' or a timestamped variant\". With a bare constant, the app-level dedup at checkpoint-send.mjs:157 refuses the SECOND on-demand send of any day with ALREADY_SENT_THIS_WINDOW, and the DB partial unique index michael_checkpoint_send_ledger_sent_slot_uniq rejects the second 'sent' row at FINALIZE -- yielding LEDGER_FINALIZE_RACE_LOST for a text that was actually delivered (an audit trail that lies about a real send). FR-1's 'on-demand sends count toward the same 4/day cap' would then be unreachable: the true ceiling is 1/day. Separately, TS-8 only tests a cap already at 4 from fixed-window rows and cannot distinguish a single shared budget from two budgets of four.",
        evidence: 'checkpoint-send.mjs:151-160 (cap + dedup filters). database/migrations/20260914_michael_checkpoint_send.sql:48-49 (partial unique index). checkpoint-send.mjs:229-241 (finalize-race classification).',
        resolution: 'CLOSED via PRD amendment: TR-5 pins the slot to a per-minute-stamped `on-demand:HH:MM` with both limbs of the rationale; TS-13 added (2 fixed-window + 2 on-demand sent rows, 5th of EACH kind refuses CAP_EXCEEDED); TS-14 added (second on-demand at a different ET minute succeeds; same ET minute still dedups).',
      },
      {
        id: 'G-5',
        severity: 'CRITICAL',
        issue: "FR-5 IS INTERNALLY INCONSISTENT ABOUT THE RESOLVER: FR-5 instructs EXEC to use resolveAllowQuietHours but quotes the two-variable expression `isSmsQuietHour(now, chairmanZone)`, which that resolver cannot supply -- it returns only a boolean. The live precedent FR-5 cites actually imports and calls resolveQuietHoursContext (the BATCHED resolver returning { allowQuietHours, chairmanZone } in one round trip). Following FR-5 literally leaves chairmanZone undefined, silently falling back to America/New_York and discarding the chairman's configured notifications.timezone -- the exact capability SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-2 added. FR-5's own correction (do not use the override resolver as if it were the gate) is right; its prescribed resolver is wrong.",
        evidence: 'scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:75 (import resolveQuietHoursContext), :311 (dep default), :322 (destructures allowQuietHours + chairmanZone), :339 (the cited composition). lib/comms/adam-outbound/quiet-hours-extension.js:77-85 (resolveAllowQuietHours returns a bare boolean) vs :130-144 (resolveQuietHoursContext).',
        resolution: 'CLOSED via PRD amendment: FR-5 TESTING-PIN mandates resolveQuietHoursContext with line-level citation of the precedent, while preserving FR-5\'s core correction that isSmsQuietHour is the in-window predicate.',
      },
      {
        id: 'G-6',
        severity: 'CRITICAL',
        issue: "TS-9 / TS-10 / FR-5-AC3 ARE NOT RUNNABLE AT THE UNIT TIER AS SPECIFIED: runCheckpointSend's deps are { sb, argv, now, sendFn, resolveIdentity, recipientSha256 } -- there is no injection point for the quiet-hours resolver. Both resolveAllowQuietHours and resolveQuietHoursContext construct a real ChairmanPreferenceStore when no store is passed, and that constructor calls createSupabaseServiceClient() -- a live DB round trip from inside a unit test. The plan implicitly assumed the override resolves to a default with nothing proving it, and nothing tested what happens when that read itself fails.",
        evidence: 'scripts/michael/checkpoint-send.mjs:98 (deps signature). lib/eva/chairman-preference-store.js:142-146 (constructor -> createSupabaseServiceClient). lib/comms/adam-outbound/quiet-hours-extension.js:79 and :134 (store defaults to a new instance). Injection precedent: chairman-hourly-heartbeat-backstop-sweep.mjs:311.',
        resolution: 'CLOSED via PRD amendment: FR-5 TESTING-PIN requires adding a resolveQuietHours dep following the backstop-sweep:311 precedent, and requires a test that the production default is the real resolver (not a permissive stub). TS-17 added for the resolver-failure path.',
      },
      {
        id: 'G-7',
        severity: 'HIGH',
        issue: "GUARD ORDER UNPINNED, AND THE LITERAL READING IS ACTIVELY HARMFUL: FR-1's enumeration lists the new quiet-hours check LAST -- after 'the staged-ledger-before-send pattern (:195)'. Implemented in that position, the verb stages a SEND_IN_PROGRESS ledger row, which counts against the 4/day cap under SEC-H2, and only THEN refuses for quiet hours -- permanently burning a cap slot on a refusal and leaving an unresolved staged row. TS-9 and TS-10 test the guard's behavior in isolation and pass under either ordering, so nothing in the plan would have caught it.",
        evidence: "FR-1 description text (the '...staged-ledger-before-send pattern (:195), and the new quiet-hours check from FR-5' enumeration). checkpoint-send.mjs:139-155 (SEC-H2 cap filter counting SEND_IN_PROGRESS) and :193-201 (staged row).",
        resolution: 'CLOSED via PRD amendment: FR-1 TESTING-PIN fixes the position (immediately after the window/on-demand branch, before the dry-run return and every later guard) and explains why the literal reading is harmful; TS-15 added as a chained-ordering proof in which EVERY later guard would also refuse, plus an assertion that exactly one ledger write occurred; TR-11 added for the cap-interaction of the quiet-hours row; TS-16 added.',
      },
    ],
    warnings: [
      {
        id: 'G-8',
        severity: 'MEDIUM',
        issue: "No scenario proved the quiet-hours resolver's own failure path. resolveQuietHoursContext returns { allowQuietHours: false, chairmanZone: DEFAULT_ZONE } on ANY throw -- a failed preference read ENFORCES quiet hours rather than bypassing them, which is the correct fail-closed posture but was nowhere stated, leaving EXEC free to wrap the call in a try/catch substituting a permissive default.",
        evidence: 'lib/comms/adam-outbound/quiet-hours-extension.js:139-141 (catch branch).',
        resolution: 'CLOSED: FR-5 TESTING-PIN forbids a permissive local try/catch; TS-17 added.',
      },
      {
        id: 'G-9',
        severity: 'MEDIUM',
        issue: "TS-4's disclosure threshold is unfalsifiable and operationally wrong. FR-4's AC says the disclosure fires when the values 'span more than a defined threshold (or simply differ)' -- the escape clause means any implementation satisfies it. And 'simply differ' is the wrong rule: the three producing feeders are scheduled at 04:00/04:30/04:45 ET, so their finished_at values essentially ALWAYS differ, firing the disclosure on every single send until the chairman learns to ignore it.",
        evidence: 'lib/michael/feeder.mjs:35,36,43 (calendar-read 04:00, gmail-triage 04:30, todoist-brief 04:45 pre-dawn anchors).',
        resolution: 'CLOSED: FR-4 TESTING-PIN pins a 60-minute threshold measured across the feeders that CONTRIBUTED A COUNT; TS-4 rewritten to assert BOTH sides of the boundary (45-minute spread does not disclose, 90-minute spread does).',
      },
      {
        id: 'G-10',
        severity: 'MEDIUM',
        issue: "FR-1's `--reason` has no destination. michael_checkpoint_send_ledger's columns are id, et_date, window_slot, outcome, refusal_code, provider_message_id, body_sha256, body_len, created_at, updated_at -- there is no free-text column for an on-demand reason, and adding one is a chairman-gated migration outside this SD's scope. Left unstated, EXEC either parses and silently discards it (a computed-then-dropped value that reads as captured) or invents a column.",
        evidence: 'database/migrations/20260914_michael_checkpoint_send.sql:33-44 (full column list).',
        resolution: 'CLOSED: FR-1 TESTING-PIN declares --reason OPTIONAL and NOT PERSISTED, requires a test that with-reason and without-reason invocations produce identical ledger rows, and routes any durability requirement back to PLAN as a scope escalation rather than an ad-hoc column.',
      },
      {
        id: 'G-11',
        severity: 'MEDIUM',
        issue: "Any db-tier test added for this SD collects ZERO tests and exits 0 when run from this worktree. vitest.config.js's `db` project sets passWithNoTests: true and the shared exclude drops **/.worktrees/** -- a clean exit-0 from here is indistinguishable from a passing run.",
        evidence: 'vitest.config.js:312-328 (db project: passWithNoTests true, SHARED_EXCLUDE). tests/ddl/michael-checkpoint-send-ddl.db.test.js header documents the same constraint.',
        resolution: 'CLOSED: TR-10 added; TS-20 carries the run-from-main-checkout instruction in its own expected text.',
      },
      {
        id: 'G-12',
        severity: 'MEDIUM',
        issue: "The on-demand CLI shape was never committed. FR-1 offers '--now with a --reason' as an 'e.g.', with no acceptance criterion pinning the flag name, whether it must be paired with --apply, or what a --now WITHOUT --apply does (the existing dry-run rule at checkpoint-send.mjs:120-123 must not be weakened by the new path). Nothing prevented EXEC from shipping --on-demand / --force / --send-now.",
        evidence: 'FR-1 description text. lib/michael/db.mjs:97-119 (parseArgs: a bare --now followed by another --flag yields true; followed by a bare token it swallows the token).',
        resolution: 'CLOSED: FR-1 TESTING-PIN commits to `--apply --now` with --now a boolean flag; TS-18 added pinning the literal token and the three invocation shapes; TS-19 added proving SEC-H1 (--et-date under --apply) still refuses under the new flag, so the on-demand path does not become a second route to the calendar-walking cap bypass.',
      },
    ],
    recommendations: [
      'EXEC must treat TR-4 (windowIdFor returns null / window_slot NOT NULL) as the first thing to get right -- the entire on-demand unit suite reports green over this failure because fakeSb enforces no column constraints.',
      'Implement FR-2 as an in-JS filter+max over an unfiltered read AND widen the select list to include `attempt` in the same edit (TR-8 + TR-9). Doing one without the other produces a fresh nondeterminism bug that passes the same tests.',
      'Use resolveQuietHoursContext (batched) rather than resolveAllowQuietHours, and add it as an injectable dep on runCheckpointSend, or TS-9/TS-10/TS-17 cannot run without a live DB (G-5 + G-6).',
      'Run TS-20 from the MAIN checkout after merge. A db-tier exit-0 from inside this worktree is not evidence (TR-10).',
      'At PLAN-TO-EXEC verification, re-check that TS-15 (guard ordering) actually asserts a single ledger write -- a quiet-hours guard in the wrong position passes TS-9/TS-10 while burning a cap slot on every refusal.',
    ],
    detailed_analysis: {
      mode: 'pre-implementation test-plan falsification (no implementation code written; scripts/michael/checkpoint-send.mjs untouched)',
      artifacts_read: [
        'product_requirements_v2 PRD-SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 (FR-1..FR-5, TR-1..TR-3, TS-1..TS-12, acceptance_criteria)',
        'scripts/michael/checkpoint-send.mjs (all 254 lines)',
        'scripts/michael/checkpoint-send.test.js (all 379 lines -- fakeSb mock-pattern census)',
        'lib/michael/feeder.mjs (FEEDERS registry, inWindow, windowIdFor, etMinuteOfDay)',
        'lib/michael/db.mjs (parseArgs, readRows, writeRows, refusal)',
        'lib/comms/adam-outbound/quiet-hours-extension.js (all 144 lines)',
        'lib/time/chairman-et-wall-clock.js (TZ default, SMS_QUIET_START/END_HOUR, isSmsQuietHour)',
        'lib/eva/chairman-preference-store.js (constructor)',
        'scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:75,311,322,339 (the cited live composition)',
        'database/migrations/20260914_michael_checkpoint_send.sql (ledger + enabled DDL, partial unique index)',
        'database/migrations/20260906_michael_tables.sql (michael_feeder_runs DDL, attempt unique index)',
        'tests/ddl/michael-checkpoint-send-ddl.db.test.js (db-tier pattern + worktree-exclusion note)',
        'vitest.config.js (unit/db project definitions, passWithNoTests)',
      ],
      prd_amendment: {
        script: 'scripts/one-off/michael-texting-plan-to-exec-prd-amend.mjs',
        additive_only: true,
        technical_requirements: '3 -> 11 (TR-4..TR-11 added)',
        test_scenarios: '12 -> 20 (TS-13..TS-20 added; TS-1/TS-4/TS-12 rewritten to be discriminating)',
        acceptance_criteria: '6 -> 10',
        fr_testing_pins_added: ['FR-1 x3 (flag shape, --reason, guard order)', 'FR-2 x2 (in-JS selection, attempt in select)', 'FR-4 x1 (60-minute threshold)', 'FR-5 x3 (resolveQuietHoursContext, injectable dep, fail-closed)'],
        retiering: 'TS-20 is the only scenario typed `db`; the other 19 are correctly `unit` GIVEN the TR-7/TR-8 in-JS constraint. Without that constraint TS-1 was mis-tiered by construction.',
      },
      why_conditional_pass: "The three CRITICAL findings (G-1, G-2, G-3) share one property: each produces a FULLY GREEN unit suite over a broken verb. A plan whose own instruments cannot detect its three highest-severity defects has not earned a PASS at the moment the gaps are merely written down. The closures are specification EXEC must honour, not behavior proven -- PASS is available at PLAN verification once the tests exist and discriminate.",
    },
    metadata: {
      // HONEST UNMEASURED VERDICT (testing-verdict-guard.js exemption): this is a PLAN-phase
      // test-plan falsification BEFORE any implementation exists -- there is nothing to run yet.
      // No test_execution is fabricated; measured is explicitly false.
      measured: false,
      test_execution: buildTestExecution({ executed: 0, passed: 0, failed: 0, skipped: 0, source: 'plan_phase_test_plan_review_pre_implementation' }),
      independent_verification: true,
      amended_prd: true,
      implementation_untouched: true,
      gaps_found: 12,
      gaps_closed_by_amendment: 12,
      critical_gaps: 5,
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/michael-texting-plan-to-exec-testing-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
