#!/usr/bin/env node
/**
 * SD_COMPLETION retrospective for SD-LEO-INFRA-TREND-EYES-OFF-001 (Trend-Eyes V1).
 * Written directly against the retrospectives table so the PLAN-TO-LEAD
 * RETROSPECTIVE_QUALITY_GATE has a retro_type=SD_COMPLETION row created after the
 * LEAD-TO-PLAN acceptance timestamp (2026-08-07T10:55:49.649829Z).
 *
 * Every count below was measured, not narrated. Where a number I would have
 * reported differs from the measurement, the measurement is what is recorded.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '21efcf8a-dcf6-4df0-8f90-bd4167d84eea';
const SD_KEY = 'SD-LEO-INFRA-TREND-EYES-OFF-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  quality_score: 94,
  tags: [
    'verify-at-the-consumer',
    'mutation-testing',
    'false-all-clear',
    'phantom-column',
    'rls',
    'invocation-path-proof',
    'trend-eyes',
    'solomon',
  ],
  title:
    'Retrospective: ' + SD_KEY + ' — Trend-Eyes V1 shipped, and four defects of ONE shape: verify at the CONSUMER, not at the merge (the sweep nearly committed the exact blindness it was chartered to detect)',

  description:
    'WHAT SHIPPED: Trend-Eyes V1, an OFF-SEAT trend sweep. A daily GitHub Actions cron (.github/workflows/solomon-trend-eyes-sweep.yml, ACTIVE schedule 0 6 * * *) runs a mechanical scan over existing sources and writes candidate rows plus a run-receipt; Solomon\'s seat grades them later. Chairman-commissioned, Solomon-authored design (design_provenance on the SD: commission advisory 3a24dd84, design advisory 933675c0, GO verbatim "I approve Solomon\'s trend design"). Seven shipped files, +1,862 LOC, zero deletions: lib/solomon/trend-eyes-probes.js (pure T1/T2/T3 probes, 220 LOC), lib/solomon/trend-eyes-liveness.js (external run-receipt liveness predicate, 53 LOC), scripts/solomon/trend-eyes-sweep.mjs (resolvers + candidate/receipt writers, 448 LOC), scripts/solomon/trend-eyes-receipt-rls-probe.mjs (behavioural RLS verification probe, 191 LOC), tests/unit/solomon/trend-eyes-probes.test.js (765 LOC), database/migrations/20260807_trend_eyes_receipt_service_role_only_STAGED.sql (RESTRICTIVE SELECT policy, APPLIED), and the workflow. 14 commits on feat/SD-LEO-INFRA-TREND-EYES-OFF-001, pushed at 52c85a7f1a6, NOT merged and NO PR open at the time of this retrospective — deliberately, per the sequencing constraint below. '
    + 'THE HEADLINE FINDING: the same defect shape appeared FOUR times, and mutation testing was the only instrument that found any of them. In every instance the fix itself was correct and the verification ran at the site of the change instead of at the site that consumes its result. The sharpest was one token: changing `t2.classes ?? undefined` to `?? []` inside runSweep took the LIVE dry-run from "UNKNOWN t2" back to "FLAT: no class recurred after its fix" with all 52 tests green, because runSweep had no tests at all and the test that "proved" the fix asserted on an expression written inline in the test itself. '
    + 'THE SECOND FINDING: this SD exists to catch instruments that report a confident all-clear while blind, and it very nearly committed that exact failure. Two phantom columns (retention_archive.payload, issue_patterns.pattern_name) made the sweep throw 42703 on every run before writing anything; and fix_shipped_at appears in 0 of 3,786 rows while lesson_class appears in 0, so T2/T3 would have reported a reassuring FLAT over a corpus that structurally cannot answer. Resolvers now return null — not [] — so the probe emits UNKNOWN with a named reason. '
    + 'TEST TRAJECTORY, measured: 23 -> 38 -> 62 -> 68 -> 71. The 71 is across tests/unit/solomon (2 files); tests/unit/solomon/trend-eyes-probes.test.js alone is 57. Mutation campaigns: 23 mutants / 14 surviving (39% kill rate) at first review, then 60 mutants / 37 killed / 23 surviving (61.7%) at re-check, with every mutant asserted to match its search string exactly once before being believed (a mutation that fails to apply leaves the suite green and is indistinguishable from a survivor; 0 fell into that trap). Wider regression: 2,962 test files and 36,194 tests green; the only 2 failures reproduce independently as an ANSI/FORCE_COLOR artifact in tests/unit/complete-quick-fix/external-timeout-and-coverage-gate.test.js, a file this SD does not touch. '
    + 'SECURITY / SEQUENCING: the run-receipt carries the chairman\'s SMS TOPIC LABELS into codebase_health_snapshots, a table granted a blanket authenticated SELECT in March when it held only code-health numbers. Merge was HELD until the RLS policy was applied AND read back, because the workflow ships an active 06:00 schedule and merging first would have raced the first sweep against an unprotected table — zero receipt rows existed, which was the entire timing argument, and merge-first spends it. Chairman ratified (decision 74f2a2c9, verbatim "Yes" 12:58:56Z, capture 54769df1); the apply ran from the apply seat (MIGRATION_APPLY_PROD_PASS, content sha256 799110f2 verified byte-identical beneath the transcribed header); BOTH arms verified — CATALOG (pg_policies: exactly one row, polpermissive=FALSE, qual dimension IS DISTINCT FROM trend_eyes_sweep_receipt) and BEHAVIOURAL (minted authenticated JWT: the seeded receipt invisible at 0 where the pre-apply baseline proved the identical seed visible at 1, and non-receipt 3976 vs 3976 by service-role at the SAME INSTANT, proving scope rather than over-breadth).',

  affected_components: [
    'lib/solomon/trend-eyes-probes.js',
    'lib/solomon/trend-eyes-liveness.js',
    'scripts/solomon/trend-eyes-sweep.mjs',
    'scripts/solomon/trend-eyes-receipt-rls-probe.mjs',
    '.github/workflows/solomon-trend-eyes-sweep.yml',
    'public.codebase_health_snapshots (RLS)',
  ],

  related_files: [
    'lib/solomon/trend-eyes-probes.js',
    'lib/solomon/trend-eyes-liveness.js',
    'scripts/solomon/trend-eyes-sweep.mjs',
    'scripts/solomon/trend-eyes-receipt-rls-probe.mjs',
    'tests/unit/solomon/trend-eyes-probes.test.js',
    'database/migrations/20260807_trend_eyes_receipt_service_role_only_STAGED.sql',
    'lib/invocation-detector/requires-invocation.js',
    'lib/solomon/chairman-sms-exchanges.js',
    'scripts/eva/eva-trend-snapshot.mjs',
    'scripts/eva/trend-detector.mjs',
  ],

  related_commits: [
    '7ed24137f2e',
    '9b82495f4d9',
    '23c6793b348',
    '5f67e932c36',
    '8a75a311cec',
    'd85188cea92',
    'c829c82da63',
    '731584bb8fb',
    'f4f49d598bf',
    'dd0ab8e503b',
    'e30a4f0ba32',
    'dbed16cf1d0',
    'b6e4065e60b',
    '52c85a7f1a6',
  ],

  what_went_well: [
    'MUTATION TESTING WAS THE ONLY RELIABLE DETECTOR OF ALL FOUR CONSUMER-SIDE DEFECTS. None of them were found by reading the code, by review prose, or by a green suite — M49 (the one-token `?? undefined` -> `?? []` revert in runSweep), M43 (the re-added Math.min clamp in resolveT3Facts), M33 (the neutered watchdog exclusion) and the vacuous dedup fixture each survived a suite that was green at the time. The re-check campaign ran 60 mutants (37 killed, 23 survived, 61.7%) against a first campaign of 23 mutants with 14 surviving (39%), and each mutant was asserted to match its search string EXACTLY ONCE before being believed, because a mutation that fails to apply leaves the suite green and is indistinguishable from a survivor. 0 fell into that trap, and `git status --porcelain` was verified clean on all three mutated files after every run.',
    'THE PER-CLASS TEST SUITE IS TWO-SIDED WITH DIFFERENT-AXIS NEGATIVES. Every probe class asserts both the firing case and a negative built on a DIFFERENT axis than the positive — T1 boundary tests at 23.5h and 24.5h against the 24h threshold (killed M3), an UPWARD-drift positive against a detector that had only ever been tested downward (killed M9), a negative-age alarm for a future-dated receipt read as fresh (killed M21), and CANDIDATE_CATEGORY imported rather than re-typed as a literal (killed M23). A one-sided suite would have passed all four mutants.',
    'REFUSED THE MERGE-FIRST SHORTCUT UNPROMPTED, AND THE REFUSAL WAS RATIFIED AS BINDING. The precheck was green at 87% and the chairman decision was approved; every visible signal said merge. The sequencing argument — the workflow ships an ACTIVE 06:00 schedule, so merging before the RLS apply makes the sweep eligible to write its first receipt into a table still carrying the blanket authenticated SELECT — is not recoverable from the code, and zero receipts existing today is the whole of it. The hold was self-imposed before anyone asked for it and then ratified by the coordinator.',
    'WROTE metadata.resume_brief ONTO THE SD WHILE THE MERGE WAS HELD (commit dbed16cf1d0). The two futures that destroy this knowledge — context compaction, or the claim re-routing to a fresh seat — neither announces itself first. The brief records the sequencing constraint, that the apply is chairman-3-factor and a worker seat structurally CANNOT run it (do not retry the denial — it is the deliberate boundary, not the stochastic classifier-denial class), that .artifacts/receipt-rls-baseline.json is NOT re-obtainable, the four decisions not to relitigate, and the four consumer-side defect shapes.',
    'T3 WAS DESCOPED ON A MEASUREMENT, NOT A GUESS. Solomon offered a counterfactual he wanted measured before accepting the descope: if issue_patterns.source_feedback_ids genuinely chains to lane rows at >0 coverage, prefer a NARROWED T3 printing its coverage fraction. Measured on the COMPLETE population — 407 of an exact 407 in the 60-day window, 1,693 all-time — chain coverage is 0.00%, and sharper than merely low: the column is a NON-NULL EMPTY ARRAY on all 1,693 rows. The measurement picked the branch.',
    'PROBED THE BLOCKER INSTEAD OF WAITING TO BE TOLD IT CLEARED — blockers self-resolve silently and nobody sends a message. Running scripts/solomon/trend-eyes-receipt-rls-probe.mjs as a self-check correctly reported the policy was not yet in effect AND exposed three defects in the probe itself, all of them found by RUNNING it rather than by inspecting it.',
    'BOTH RLS ARMS VERIFIED, NEITHER ON TRUST, AND THE PRE-APPLY BASELINE WAS CAPTURED IN A WINDOW THAT WAS NOT RE-OBTAINABLE. .artifacts/receipt-rls-baseline.json (captured 2026-08-07T16:28:23Z) proves the identical seeded receipt WAS visible at 1 to an authenticated JWT before the apply — without it, the post-apply 0 is indistinguishable from a probe that never could see anything. The catalog arm structurally could not be run from the worker seat (PostgREST exposes no pg_policies and no exec_sql RPC exists), and that limit was named rather than papered over.',
    'CAUGHT A NAME-KEYED BLIND SPOT AT PLAN, BEFORE THE ENTRYPOINT EXISTED. The file was going to be trend-eyes-scan.mjs. lib/invocation-detector/requires-invocation.js:26 matches -(loop|cron|sweep|sweeper|daemon|worker|autotriage) and :23 matches only cron/clockwork directories, so "-scan" would have been INVISIBLE to INVOCATION_PATH_PROOF — the same blind spot that let scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs ship unwired under SDs marked COMPLETED. Renamed to -sweep, and TS-12 pins BOTH directions so a future rename cannot silently re-open it.',
    'MEASURED THE POPULATION BEFORE BELIEVING THE SAMPLE, AND CAUGHT A CAP MID-MEASUREMENT. The classifier census used an exact count(head) then a paginated fetch with fetched===population asserted (342/342). During the T3 probe the first lane fetch returned EXACTLY 1000 rows against a true population of 3,894 — the Supabase default cap. It did not change the verdict (the discriminant was the complete issue_patterns side) but the number would have been wrong, and it was caught rather than reported around.',
    'CORRECTED THE MIGRATION\'S OWN STALE NARRATION RATHER THAN SHIPPING IT (52c85a7f1a6). After the apply landed, the file still read "NOT YET APPROVED FOR APPLY ... there is no approved-by attestation on this file" — printed directly beneath the chairman\'s approved-by attestation, on a live migration. Both halves were false. A file whose prose denies the artifact it sits on is exactly this SD\'s defect class, and it did not get to ship inside it.',
    'NO REGRESSION ATTRIBUTABLE TO THIS SD, PROVEN RATHER THAN ASSERTED: 2,962 test files and 36,194 tests green. The 2 failures reproduce directly as an ANSI/FORCE_COLOR artifact (the test spawns `node -e console.log(Number)` and compares stdout to a bare numeral; Node colorizes it) and pass under FORCE_COLOR=0, in a file importing scripts/modules/complete-quick-fix, which this SD — 0 deletions, touching only lib/solomon, scripts/solomon, tests/unit/solomon, .github/workflows and .artifacts — does not touch.',
  ],

  what_needs_improvement: [
    'THE DOMINANT DEFECT CLASS, FOUR INSTANCES, ALL THE SAME SHAPE: I verified at the MERGE (where I made the change) instead of at the CONSUMER (what reads its result). (a) I fixed the phantom columns in the resolvers and verified the RESOLVERS — but runSweep, which converts their null into the probe\'s facts, had ZERO tests; changing `?? undefined` to `?? []` there was ONE TOKEN and restored a false all-clear against LIVE data with all 52 tests green. (b) I removed a Math.min clamp from resolveT3Facts and "proved" it with a test that called the PROBE directly and never invoked the resolver where the clamp actually lived. (c) I fixed the RLS probe\'s seed leak with a `return`, which made the trailing process.exit unreachable, so a FAILED verify exited 0 — the gate reported failure in prose while telling every caller it PASSED. (d) I wrote a dedup test whose fixture gave each finding a distinct questionClass, so the index suffix under test was never load-bearing and its mutation survived. In every case the mutation that would have caught it was cheap and already existed as a technique; it just was not run until a reviewer forced it.',
    'A TEST WRITTEN BY WHOEVER WROTE THE FIX INHERITED THE FIX\'S ASSUMPTION, TWICE. The questionClass "corpus" tests asserted on SYNTHETIC strings ("Are we missing any texts?", "did the texts get through") that I wrote from the same mental model as the fix. They confirmed the fix and missed the population: measured, 328 of 342 real messages classified to null, and ZERO of the 97 messages mentioning sms/text/message received the sms-coverage class. T1 therefore could not fire on the SD\'s OWN FOUNDING CASE — all three chairman bodies (2026-08-03T10:17:12Z, 2026-08-05T11:19:37Z, 2026-08-05T11:54:20Z) return null, because they match the SUBJECT regex but carry no predicate term. Worse, the commit message stated the fix in the PAST TENSE while the corpus refuted it.',
    'THE SD NEARLY COMMITTED THE EXACT FAILURE IT WAS CHARTERED TO DETECT. It exists to catch instruments that report a confident all-clear while blind. Two phantom columns (retention_archive.payload, issue_patterns.pattern_name) meant the sweep threw 42703 on every run before writing anything — so the first shipped state was not a wrong reading but NO reading. And fix_shipped_at appears in 0 of 3,786 rows with lesson_class in 0, so T2/T3 would have emitted a reassuring FLAT over a corpus that structurally cannot answer the question.',
    'A KEY THAT PARSES IS NOT A KEY THAT CORRESPONDS. Repairing the phantom `pattern_name` by swapping in `pattern_id` made the query SUCCEED while the numerator became structurally always zero — lane keys are feedback/harness-bug/stuck, pattern_ids are PAT-AUTO-b442fd90, and measured over 60 days the two vocabularies share NOTHING. T3 would have reported total disjunction that was really an absent join key. The tell was sitting in the code: `issue_summary` was selected and never read. I swapped for a key that parses, not one that corresponds.',
    'THE CLASSIFIER IS STILL NOT OPERATIONAL ON ITS FOUNDING CASE, AND THE HONEST NUMBER IS SMALLER THAN THE APPARENT ONE. Re-measured after the widening: 342 population, 76 automated excluded, 266 non-automated, 24 classified, 242 null (91.0% of non-automated, down from 95.9% of all rows). Of the 86-row apparent improvement, 76 rows are the watchdog EXCLUSION, not classification — actual classification went 14 -> 24 rows, a net gain of TEN. sms-coverage assigned exactly 1 row, and that row is a 2026-07-21 relay test ("Please confirm you received this text message"), not a coverage question.',
    'sms-coverage IS 100% WATCHDOG NOISE PLUS ONE RELAY TEST, HELD APART ONLY BY AN UNTESTED ORDERING. The 80-minute watchdog body classifies AS sms-coverage on its own text, and 76 of 342 corpus rows are that watchdog. Only the ORDER of two lines in an untested function stood between the fleet and a GUARANTEED DAILY false positive — dropping the `continue` took the live run from 2 to 3 firing classes with the suite green (M33).',
    'I WOULD HAVE REPORTED "71 tests in tests/unit/solomon/trend-eyes-probes.test.js". Measured just now: that file has 57; the 71 is the total across tests/unit/solomon (2 files, the other being chairman-sms-exchanges.test.js at 14). The count was correct and attached to the wrong denominator — the same numerator/denominator-span error this SD spent its life catching, committed in its own reporting.',
    'V1 SHIPS WITH ONE OF THREE PROBES DESCOPED AND ANOTHER NOT REACHING ITS CHARTER CASE. T3 is descoped with a named return trigger; T2 answers UNKNOWN on live data because fix_shipped_at is unpopulated; T1 fires on 3 real classes but not the one the chairman asked about. That is an honest V1, but the receipt must keep printing the descope and the blindness reasons or a later reader will mistake the silence for a clean look.',
    'THE SD IS COMPLETE AND UNMERGED: branch feat/SD-LEO-INFRA-TREND-EYES-OFF-001 is pushed at 52c85a7f1a6 with NO PR open. The RLS apply that gated the merge has now landed and both arms are green, so the hold has expired — but "held for a good reason" and "forgotten" look identical from outside, and nothing currently expires this state or names its owner.',
    'THREE DEFECTS IN MY OWN VERIFICATION PROBE, FOUND ONLY BY RUNNING IT. (1) The over-broad arm compared the authenticated non-receipt count against the pre-apply BASELINE number on a LIVE table other processes write to (3965 -> 3966 -> 3967 across consecutive runs), so it fired on an unrelated insert AND reported an INCREASE as "the policy is OVER-BROAD" — over-broad means visibility goes DOWN, so the diagnosis was confidently backwards. (2) process.exit() inside the try terminated before `finally`, so the synthetic seed survived on the FAILURE path; two orphans accumulated and the next run read "2 receipt rows visible", partly measuring its own litter — and because the liveness predicate keys on a receipt EXISTING, a stray seed makes a sweep that has never run look alive. (3) Fixing (2) with `return` made the trailing process.exit unreachable, so a failed verify exited 0.',
  ],

  key_learnings: [
    'VERIFY AT THE CONSUMER, NOT AT THE MERGE. Four defects in this SD had exactly one shape: the fix was correct, the verification ran where the change was made, and the site that CONSUMES the changed value was untested. The canonical instance is one token — `t2.classes ?? undefined` to `?? []` inside runSweep — which took the live dry-run from UNKNOWN back to a false FLAT with 52 of 52 tests green, because runSweep had no tests and the "proof" test asserted on an expression written inline in the test itself. Operational rule adopted: for every fix, NAME the consumer that reads its result and NAME the mutation that would prove it; if the consumer has no test, the fix is not verified regardless of how many tests are green.',
    'A TEST WRITTEN BY WHOEVER WROTE THE FIX INHERITS THE FIX\'S ASSUMPTION UNLESS THE FIXTURE COMES FROM OUTSIDE IT. My questionClass tests asserted on synthetic strings drafted from the same mental model as the classifier fix; they confirmed the fix and missed the population (328 of 342 real messages -> null; 0 of 97 sms-mentioning messages assigned sms-coverage; the SD\'s own founding-case bodies unclassifiable). The fixture must come from OUTSIDE the fix — real corpus rows, or the mutation. A control built on the assumption it is meant to check is not a control.',
    'THE INSTRUMENT BUILT TO DETECT A BLINDNESS CLASS IS NOT IMMUNE TO IT — AND IS UNUSUALLY LIKELY TO COMMIT IT, BECAUSE ITS AUTHOR BELIEVES THE OPPOSITE. Trend-Eyes exists to catch confident all-clears over corpora that cannot answer, and it shipped two phantom columns (threw on every run) plus FLAT-over-unanswerable (fix_shipped_at in 0 of 3,786 rows, lesson_class in 0). The generalizable fix is structural, not attentional: resolvers return null rather than [], so an absent corpus becomes UNKNOWN-with-a-named-reason instead of an empty set that renders as health. Any three-state signal (measured-nonzero / measured-zero / never-measured) collapsed into two branches routes "never measured" into the healthy one.',
    'A KEY THAT PARSES IS NOT A KEY THAT CORRESPONDS, AND THE TELL IS USUALLY A SELECTED-BUT-UNREAD COLUMN. Swapping the phantom pattern_name for pattern_id made the query succeed while the numerator became structurally always zero — lane keys (harness-bug/stuck) and pattern_ids (PAT-AUTO-...) share zero overlap over 60 days. A repair that removes an ERROR is not a repair that restores MEANING; when a fix makes a query stop failing, measure the resulting join CARDINALITY before believing it, and treat any column you selected and never read as evidence you swapped syntax for semantics.',
    'NAME-KEYED INSTRUMENTS HAVE FILENAME BLIND SPOTS, AND THE BLIND SPOT IS INVISIBLE TO THE THING IT HIDES FROM. The entrypoint was going to be trend-eyes-scan.mjs; lib/invocation-detector/requires-invocation.js:26 matches -(loop|cron|sweep|sweeper|daemon|worker|autotriage) and :23 matches only cron/clockwork dirs, so "-scan" would have been unreachable to INVOCATION_PATH_PROOF — the same blind spot that let scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs ship UNWIRED under SDs marked COMPLETED. When a gate is keyed on a NAME, check your artifact against the pattern before choosing the name, and pin BOTH directions (TS-12) so a later rename cannot silently re-open it.',
    'A SURVIVOR TABLE MEASURES THE DELETION POLICY, NOT THE PHENOMENON. session_coordination holds 3,725 rows spanning about two weeks with 84% from the last 7 days — a trend probe reading it alone would measure retention, then report the resulting shape as behaviour. T2 now reads retention_archive UNION session_coordination (44,003 archived rows back to 2026-03-11). Before trending any table, ask what deletes from it and over what horizon; if the answer is "something does", the un-archived table is a window, not a corpus.',
    'A RETURN TRIGGER MUST BE PHRASED ON THE PREDICATE THAT IS ACTUALLY FALSE TODAY. T3 was descoped because issue_patterns.source_feedback_ids is a NON-NULL EMPTY ARRAY on all 1,693 rows (0.00% chain coverage), which means a reader checking IS NOT NULL gets 1,693 of 1,693 and concludes the provenance key is fully populated. The trigger therefore had to test NON-EMPTY: phrased on non-null it is already 100% true, would fire immediately, and would re-admit T3 against a join key carrying nothing — reinstating the structurally-zero ratio the descope exists to avoid. A dormancy condition written against the wrong emptiness is worse than no condition, because it wakes on a lie.',
    'SEQUENCE THE MERGE AGAINST THE SCHEDULE, NOT AGAINST THE APPROVAL. The workflow ships an ACTIVE 06:00 cron, so merging before the RLS policy was applied would have made the sweep eligible to write chairman SMS topic labels into a table still carrying a blanket authenticated SELECT — the exact exposure the policy was ratified to close. Zero receipts existed, which was the entire timing argument, and merge-first spends it irreversibly. A green precheck plus an approved decision is NOT authorization to merge when the artifact being merged can act on its own schedule; identify what the merged code does UNATTENDED before treating approval as sufficient.',
    'VERIFY A SECURITY POLICY ON BOTH A CATALOG ARM AND A BEHAVIOURAL ARM, AND CAPTURE THE PRE-STATE FIRST BECAUSE IT IS NOT RE-OBTAINABLE. pg_policies proves the policy EXISTS with the intended qual; a minted authenticated JWT proves it BITES. Neither alone is sufficient: a policy can be catalogued and unreachable, or a probe can read 0 because it never could see anything. The pre-apply baseline (seeded receipt visible at 1) is what makes the post-apply 0 falsifiable, and it exists only in the window before the apply. Also compare SAME-INSTANT against service-role rather than against a stored baseline number — codebase_health_snapshots grew 3965 -> 3966 -> 3967 between readings, and a time-axis comparison fired on an unrelated insert.',
    'A GUARD PLACED ON A FAILING BRANCH BREAKS EXACTLY WHEN IT FIRES. Fixing the probe\'s seed leak with a `return` inside the try made the trailing process.exit unreachable, so a FAILED verify exited 0 — the gate narrated failure in prose while telling every caller it passed. Exit codes must be module-scoped and applied AFTER main resolves, and the failure path must be exercised: a cleanup or exit path that has only ever run on success is untested where it matters most.',
    'AN APPARENT IMPROVEMENT MUST BE DECOMPOSED INTO EXCLUSION VERSUS ACTUAL COVERAGE BEFORE IT IS REPORTED. Classifier coverage looked like an 86-row improvement; 76 of those rows were the watchdog EXCLUSION and only 10 were newly classified (14 -> 24). Reporting the 86 would have been true and misleading. When a denominator changes in the same commit as a numerator, report both movements separately or the ratio narrates a change nobody made.',
    'A NUMBER CAN BE RIGHT AND ATTACHED TO THE WRONG DENOMINATOR. "71 tests in trend-eyes-probes.test.js" is measured as 57 in that file and 71 across tests/unit/solomon (2 files). Both numbers are real; the sentence joining them was not. Any count carried between contexts must be re-measured at the scope it is being asserted about, not re-cited from where it was first produced.',
    'PROBE THE BLOCKER; BLOCKERS SELF-RESOLVE SILENTLY AND NOBODY TELLS YOU. Running the RLS probe as a self-check rather than waiting for an apply-confirmed message correctly reported "not yet in effect" AND surfaced three defects in the probe itself. A blocked seat that idles learns nothing; a blocked seat that runs its own unblock check converts dead time into verification of the instrument it will need the moment the block clears.',
  ],

  action_items: [
    {
      title: 'Add a PLAN-phase prompt requiring each fix to NAME its consumer and the mutation that would prove it',
      text: 'Add a PLAN-phase prompt requiring each fix to NAME its consumer and the mutation that would prove it',
      category: 'PROCESS',
      description:
        'Four defects in SD-LEO-INFRA-TREND-EYES-OFF-001 shared one shape: verified at the site of the change, untested at the site that consumes the result (M49 runSweep, M43 resolveT3Facts, the RLS probe exit code, the vacuous dedup fixture). Add two mandatory fields to the PLAN-phase fix template and to the TESTING sub-agent prompt: (1) CONSUMER — the exact function/file that reads this value downstream, and whether it has a test; (2) KILLING MUTATION — the single-token edit that would revert this fix, and the test that fails under it. A fix whose CONSUMER field is empty or whose consumer has no test is not accepted as verified regardless of suite colour.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Make the sms-coverage class operational against the founding case, or state plainly in the receipt that it is not',
      text: 'Make the sms-coverage class operational against the founding case, or state plainly in the receipt that it is not',
      category: 'BUG',
      description:
        'T1 still cannot fire on SD-LEO-INFRA-TREND-EYES-OFF-001\'s own charter specimen: all three chairman bodies (2026-08-03T10:17:12Z, 2026-08-05T11:19:37Z, 2026-08-05T11:54:20Z) classify to null because they match the SUBJECT regex (sms) but carry no predicate term. Measured: 242 of 266 non-automated rows unclassified (91.0%); sms-coverage assigned exactly 1 row and that row is a 2026-07-21 relay test. TESTING condition C4 was cleared by amending the comment; the CLASS is still not operational. Either widen the classifier using VERBATIM corpus bodies as fixtures (never author-written synthetic strings), or make the receipt print sms-coverage as NOT-YET-OPERATIONAL so its silence is never read as absence of the phenomenon.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Open the PR and merge feat/SD-LEO-INFRA-TREND-EYES-OFF-001 — the gating condition has cleared and nothing expires the hold',
      text: 'Open the PR and merge feat/SD-LEO-INFRA-TREND-EYES-OFF-001 — the gating condition has cleared and nothing expires the hold',
      category: 'PROCESS',
      description:
        'The branch is pushed at 52c85a7f1a6 with NO PR open. The merge was deliberately held until the receipt RLS policy was applied AND read back; that condition is now satisfied (MIGRATION_APPLY_PROD_PASS, catalog arm one restrictive row in pg_policies, behavioural arm seeded receipt invisible at 0 against a pre-apply baseline of 1, non-receipt 3976 vs 3976 same-instant). "Held for a good reason" and "forgotten" are indistinguishable from outside, and no mechanism currently expires this state or names its owner. Open the PR, cite both verification arms, merge, and then confirm the 06:00 sweep writes its first receipt.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Sweep for other name-keyed gate blind spots and wire the two eva trend scripts that shipped unwired',
      text: 'Sweep for other name-keyed gate blind spots and wire the two eva trend scripts that shipped unwired',
      category: 'INFRASTRUCTURE',
      description:
        'lib/invocation-detector/requires-invocation.js:26 keys INVOCATION_PATH_PROOF on a filename suffix regex -(loop|cron|sweep|sweeper|daemon|worker|autotriage) and :23 on cron/clockwork directories. SD-LEO-INFRA-TREND-EYES-OFF-001 avoided the blind spot only by renaming trend-eyes-scan.mjs to trend-eyes-sweep.mjs at PLAN. The two known victims — scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs — shipped UNWIRED under SDs marked COMPLETED and are still unwired. Enumerate every periodic-intent script whose name does not match the pattern, wire or retire the ones found, and consider keying the detector on an in-file declaration rather than the filename so the gate cannot be evaded by a naming choice.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Require a corpus-derived fixture (or a mutation) for any test written by the author of the fix it verifies',
      text: 'Require a corpus-derived fixture (or a mutation) for any test written by the author of the fix it verifies',
      category: 'TESTING',
      description:
        'Two tests in SD-LEO-INFRA-TREND-EYES-OFF-001 were vacuous in the same way: the questionClass "corpus" tests asserted on synthetic strings drafted from the same mental model as the classifier fix, and the writeCandidates dedup test gave each finding a DISTINCT questionClass so the index suffix under test was never load-bearing. Both confirmed the fix and missed the population. Add to the TESTING sub-agent checklist: for any classifier, matcher, dedup key or parser, the fixture must be VERBATIM rows drawn from the live corpus (cited with their ids/timestamps) or the test must be accompanied by the mutation it kills. Author-written example strings are permitted only as ADDITIONAL cases, never as the sole evidence.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Add a merge-sequencing check for artifacts that act on their own schedule',
      text: 'Add a merge-sequencing check for artifacts that act on their own schedule',
      category: 'SECURITY',
      description:
        'SD-LEO-INFRA-TREND-EYES-OFF-001 merged-last only because a human held it: the PR contained a workflow with an ACTIVE 0 6 * * * schedule whose first run would write chairman SMS topic labels into codebase_health_snapshots while it still carried a blanket authenticated SELECT. A green precheck plus an approved chairman decision made merge look safe. Add a pre-merge check: when a diff adds or enables a scheduled workflow, a cron entry, or any self-triggering job, require an explicit statement of what it does UNATTENDED on its first run and confirmation that every dependency it writes to is already in its final protected state. Approval of the CHANGE is not approval of the SEQUENCE.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Make trend-eyes-liveness distinguish a real run-receipt from a probe seed',
      text: 'Make trend-eyes-liveness distinguish a real run-receipt from a probe seed',
      category: 'BUG',
      description:
        'lib/solomon/trend-eyes-liveness.js keys on a run-receipt EXISTING. During RLS verification, scripts/solomon/trend-eyes-receipt-rls-probe.mjs leaked its synthetic seed on the failure path (process.exit inside try skipped finally) and two orphans accumulated, so the next reading was partly measuring the probe\'s own litter — and a stray seed makes a sweep that has NEVER RUN look alive. The leak is fixed and cleanup is now proven on the failure path, but the predicate still cannot tell a seed from a run. Add a provenance marker to the seed (or require a field only the real sweep writes) so liveness cannot be satisfied by test litter.',
      priority: 'medium',
      owner_role: 'EXEC',
    },
    {
      title: 'Add a PLAN-phase corpus-answerability check before any trend probe is specified',
      text: 'Add a PLAN-phase corpus-answerability check before any trend probe is specified',
      category: 'PROCESS',
      description:
        'Three separate corpus facts should have been measured at PLAN rather than discovered at EXEC in SD-LEO-INFRA-TREND-EYES-OFF-001: fix_shipped_at is populated in 0 of 3,786 rows and lesson_class in 0 (so T2 can only answer UNKNOWN); issue_patterns.source_feedback_ids is a non-null EMPTY array on all 1,693 rows (0.00% chain coverage, forcing the T3 descope); and session_coordination is a SURVIVOR table at 3,725 rows / ~2 weeks with 84% from the last 7 days, so it measures retention until it is UNIONed with retention_archive (44,003 rows back to 2026-03-11). Add a required PLAN artifact for every trend/drift probe: for each field the probe reads, the populated-row count, the population, and the retention horizon of the table — with the probe descoped or forced to UNKNOWN when the corpus cannot answer.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Re-run the T3 return-trigger check when the lane-to-pattern provenance SD ships',
      text: 'Re-run the T3 return-trigger check when the lane-to-pattern provenance SD ships',
      category: 'ENHANCEMENT',
      description:
        'T3 is descoped from V1 with Solomon\'s named return trigger, encoded as T3_DESCOPE and pinned by test: T3 re-enters when the lane-to-pattern promotion SD ships its provenance key. The trigger MUST test NON-EMPTY on issue_patterns.source_feedback_ids, never non-null — non-null is already 100% true across all 1,693 rows and would fire immediately against a join key that carries nothing. Separately, whether a real lane-to-pattern correspondence exists at all is an open PRD question (lane keys harness-bug/stuck vs PAT-AUTO-... pattern_ids, measured overlap 0 over 60 days) and was escalated rather than decided in EXEC. The descope and its trigger print on EVERY receipt so the state stays visible.',
      priority: 'medium',
      owner_role: 'LEAD',
    },
    {
      title: 'Report exclusion and coverage as separate movements whenever a denominator changes with the numerator',
      text: 'Report exclusion and coverage as separate movements whenever a denominator changes with the numerator',
      category: 'PROCESS',
      description:
        'The classifier looked 86 rows better after the widening; 76 of those were the watchdog EXCLUSION and only 10 were newly classified (14 -> 24 of 342). Separately, "71 tests in tests/unit/solomon/trend-eyes-probes.test.js" is measured as 57 in that file and 71 across the directory. Both are cases of a correct number joined to the wrong extent. Add to the retrospective and sub-agent evidence templates: any ratio must state its numerator scope and denominator scope explicitly, and any count carried between contexts must be RE-MEASURED at the scope it is asserted about rather than re-cited from where it was produced.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
  ],

  improvement_areas: [
    {
      area: 'Four defects verified at the merge instead of at the consumer',
      analysis:
        'M49 (runSweep `?? undefined` -> `?? []`, one token, restored a false all-clear against live data with 52/52 green because runSweep had no tests), M43 (Math.min clamp re-added in resolveT3Facts; the proof test never called the resolver), the RLS probe returning exit 0 on a FAILED verify after a `return` made the trailing process.exit unreachable, and a dedup fixture whose distinct classes made the index suffix non-load-bearing. All four survived a green suite; all four were found by mutation.',
      prevention:
        'The null->facts conversion is now a NAMED EXPORTED function (toProbeFacts) tested directly rather than an inline expression; resolveT1Facts and resolveT3Facts are tested through a lane double at the RESOLVER, not the probe; the probe exit code is module-scoped and applied after main resolves with the failure path exercised; the dedup fixture was rebuilt on the actual collapse case (T3 series evidence falls back to the literal series key, so the index is the only discriminator). Tracked forward as the PLAN-phase CONSUMER + KILLING MUTATION fields.',
    },
    {
      area: 'The detector nearly shipped the blindness it exists to detect',
      analysis:
        'Two phantom columns (retention_archive.payload, issue_patterns.pattern_name) threw 42703 on every run before any write, and fix_shipped_at / lesson_class are populated in 0 of 3,786 and 0 rows respectively — so T2/T3 would have rendered a reassuring FLAT over a corpus that structurally cannot answer.',
      prevention:
        'Columns verified column-by-column against the live schema independently of the author account (.artifacts/qa-recheck/schema-verify.mjs). Resolvers now return null rather than [] on an unanswerable corpus, so the probe emits UNKNOWN with a named reason ("no row carried fix_shipped_at — after-fix recurrence is unanswerable") and the receipt reports unknown_count and blindness. The conversion lives in exactly one place (toProbeFacts) and is pinned by test.',
    },
    {
      area: 'Tests authored by the fix author inherited the fix assumption',
      analysis:
        'The questionClass "corpus" tests asserted on synthetic strings written from the same mental model as the fix; measured against the real population, 328 of 342 messages classified to null and 0 of 97 sms-mentioning messages received sms-coverage, so T1 could not fire on the SD\'s own founding case. The commit message asserted the fix in the past tense while the corpus refuted it.',
      prevention:
        'Tests now use VERBATIM corpus bodies, and the founding-case bodies are measured directly (.artifacts/qa-recheck/founding-case.mjs, .artifacts/qa-recheck/classifier-coverage.mjs) rather than assumed. Carried forward as a standing TESTING requirement that classifier/parser/dedup fixtures be corpus-derived or mutation-accompanied.',
    },
    {
      area: 'A repaired query that parses but does not correspond',
      analysis:
        'Swapping the phantom pattern_name for pattern_id made the T3 query succeed while the numerator became structurally always zero — lane keys (harness-bug/stuck) and pattern_ids (PAT-AUTO-b442fd90) share zero overlap over 60 days. The tell was `issue_summary` selected and never read.',
      prevention:
        'The resolver now DETECTS zero overlap and returns UNKNOWN with the reason instead of reporting total disjunction as a finding. Whether a real correspondence exists was escalated as a PRD question rather than resolved by inventing a join. Generalized as: when a fix makes a query stop erroring, measure the resulting join cardinality before believing it.',
    },
    {
      area: 'A name-keyed gate with a filename blind spot, nearly repeated for a third time',
      analysis:
        'lib/invocation-detector/requires-invocation.js:26 matches -(loop|cron|sweep|sweeper|daemon|worker|autotriage) and :23 matches only cron/clockwork dirs. The planned entrypoint trend-eyes-scan.mjs would have been invisible to INVOCATION_PATH_PROOF — the same blind spot that let scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs ship unwired under COMPLETED SDs.',
      prevention:
        'Renamed to trend-eyes-sweep.mjs at PLAN, before the file existed, and TS-12 pins BOTH directions so a future rename cannot silently re-open the gap. Tracked forward as a sweep for other unmatched periodic-intent scripts and a proposal to key the detector on an in-file declaration rather than the filename.',
    },
    {
      area: 'A security policy whose verification had to outlive an irreversible window',
      analysis:
        'The run-receipt carries chairman SMS topic labels into codebase_health_snapshots, granted a blanket authenticated SELECT in March for code-health numbers. Zero receipt rows existed, which made the timing argument possible exactly once; the workflow ships an ACTIVE 06:00 schedule, so merging first would have raced the first sweep against an unprotected table.',
      prevention:
        'Merge held until the policy was applied AND read back, ratified as binding. Pre-apply baseline captured while it was still obtainable (.artifacts/receipt-rls-baseline.json: seeded receipt visible at 1, non-receipt 3965). Both arms verified: catalog (pg_policies, one restrictive row, exact qual) and behavioural (minted authenticated JWT; receipt invisible at 0, non-receipt 3976 vs 3976 same-instant against service-role — a same-instant comparison chosen after the baseline-number comparison fired on unrelated inserts as the table grew 3965 -> 3966 -> 3967).',
    },
  ],

  success_patterns: [
    'Mutation testing as the primary detector, not a supplement: 60 mutants / 37 killed / 23 survived at re-check against 23 / 14 surviving at first pass — every one of the four consumer-side defects was found this way and none by reading the code',
    'Each mutant asserted to match its search string EXACTLY ONCE before being believed, because a mutation that fails to apply leaves the suite green and is indistinguishable from a survivor (0 fell into that trap; working tree verified clean after every run)',
    'Two-sided per-class assertions with negatives on a DIFFERENT axis than the positive — 23.5h/24.5h boundaries, an UPWARD-drift case for a downward-only detector, a negative-age alarm for a future-dated receipt, CANDIDATE_CATEGORY imported rather than re-typed',
    'Refused the merge-first shortcut UNPROMPTED against a green 87% precheck and an approved chairman decision, then had the refusal ratified as binding by the coordinator',
    'Wrote metadata.resume_brief onto the SD while the merge was held, so the sequencing constraint survives context compaction or a claim re-route — the two futures that destroy it and neither announces itself',
    'Descoped T3 on a MEASUREMENT of the counterfactual Solomon asked for (0.00% chain coverage on a complete 407-of-407 / 1,693-row population), not on a judgement call',
    'Probed the blocker rather than waiting for an apply-confirmed message — which both reported the true state and exposed three defects in the probe itself',
    'Captured the pre-apply RLS baseline in the only window it was obtainable, making the post-apply reading falsifiable rather than merely reassuring',
    'Compared same-instant against service-role instead of against a stored baseline number, removing the time axis from a check on a live table that grew twice during verification',
    'Caught a 1000-row Supabase default cap mid-measurement and reported the true population (3,894) rather than the cap',
    'Corrected the migration file\'s own stale narration after the apply landed instead of shipping prose that denied the attestation printed above it',
  ],

  failure_patterns: [
    'Verified at the merge, not at the consumer — four times: runSweep untested while its resolvers were fixed; a clamp removal proved by a test that never called the resolver; an exit code made unreachable by the fix above it; a dedup fixture whose distinct classes made the key under test non-load-bearing',
    'A one-token revert (?? undefined -> ?? []) restored a false all-clear against LIVE data with the entire suite green',
    'A test written by the author of the fix, on fixtures drawn from the same mental model as the fix — confirmed the fix, missed the population (328 of 342 -> null; 0 of 97 sms-mentioning rows classified)',
    'The instrument built to catch confident all-clears shipped two phantom columns that threw on every run, and would have emitted FLAT over fields populated in 0 of 3,786 rows',
    'A key that parses but does not correspond: pattern_id resolves cleanly and makes the numerator structurally always zero; the tell was issue_summary selected and never read',
    'A guard on the failing branch: process.exit inside try skipped finally, leaking the probe seed exactly on the failure path — and the liveness predicate keys on that seed existing',
    'A fix that broke its own verifier: the `return` that stopped the leak made the trailing process.exit unreachable, so a FAILED verify exited 0',
    'A confidently backwards diagnosis: the over-broad arm reported an INCREASE in visible rows as "the policy is OVER-BROAD", when over-broad means visibility goes DOWN',
    'An apparent 86-row coverage improvement that was 76 rows of EXCLUSION and 10 rows of actual classification',
    'A correct count attached to the wrong extent: 71 tests is the tests/unit/solomon directory total, not trend-eyes-probes.test.js, which has 57',
    'A commit message asserting a classifier fix in the PAST TENSE while the corpus refuted it — stale narration inside the SD whose subject is stale narration',
  ],

  business_value_delivered:
    'Gives the chairman a SECOND SET OF EYES that runs off-seat and cannot be crowded out by seat work: a daily 06:00 GitHub Actions sweep performs the mechanical scan over existing sources and writes candidate rows plus a run-receipt, leaving Solomon\'s seat to do only the grading. The design is Solomon-authored against a chairman commission, and the split is the point — the expensive judgment stays on-seat while the cheap, forgettable, every-single-day part becomes infrastructure. Equally valuable is what V1 refuses to claim: T2 answers UNKNOWN (fix_shipped_at populated in 0 of 3,786 rows) and T3 is descoped with a measured return trigger rather than emitting a reassuring FLAT over a corpus that cannot answer, so nobody is told the trend is stable by an instrument that never looked. The exploration_floor and classifier_coverage fields on every receipt are the anti-narrowing instrument: they make the sweep\'s OWN blindness a printed number rather than a silence.',

  customer_impact:
    'Indirect. Internal governance/observability for the chairman-Solomon lane; no end-user product surface changed. The only externally-visible change is a tightening: codebase_health_snapshots now carries a RESTRICTIVE SELECT policy excluding dimension=trend_eyes_sweep_receipt from the authenticated role, verified not to affect the other 3,976 non-receipt rows.',

  technical_debt_addressed: true,
  technical_debt_created: true,
  bugs_found: 11,
  bugs_resolved: 9,
  tests_added: 71,
  test_total_count: 71,
  test_passed_count: 71,
  test_failed_count: 0,
  test_verdict: 'PASS',
  performance_impact:
    'Off-seat by design: the sweep runs in GitHub Actions on a 0 6 * * * schedule, so it adds zero cost to any seat tick. Reads are bounded and paginated; the largest single read during verification was 3,894 lane rows (after a 1000-row default cap was detected and defeated). The RLS policy is a RESTRICTIVE SELECT on one dimension value and does not change any existing query plan of consequence.',

  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC', 'Explore', 'VALIDATION', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'VISION_FIDELITY', 'RETRO'],
  sub_agents_involved: ['Explore', 'VALIDATION', 'DESIGN', 'DATABASE', 'RISK', 'STORIES', 'TESTING', 'SECURITY', 'VISION_FIDELITY'],
  human_participants: ['CHAIRMAN', 'LEAD'],
  team_satisfaction: 9,

  metadata: {
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-INFRA-TREND-EYES-OFF-001',
    head: '52c85a7f1a64a877fb82cbbde4fb0d1ff5984da5',
    pr: 'NONE OPEN at retrospective time — branch pushed, merge held for the RLS apply (now cleared)',
    merge_state: 'UNMERGED. Held deliberately until the receipt RLS policy was applied AND read back; both arms are now green, so the hold has expired and nothing expires it automatically.',
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-TREND-EYES-OFF-001',
    files_new: [
      'lib/solomon/trend-eyes-probes.js (220)',
      'lib/solomon/trend-eyes-liveness.js (53)',
      'scripts/solomon/trend-eyes-sweep.mjs (448)',
      'scripts/solomon/trend-eyes-receipt-rls-probe.mjs (191)',
      'tests/unit/solomon/trend-eyes-probes.test.js (765)',
      '.github/workflows/solomon-trend-eyes-sweep.yml (59)',
      'database/migrations/20260807_trend_eyes_receipt_service_role_only_STAGED.sql (126)',
    ],
    diff_stat: '7 shipped files / +1,862 LOC, 0 deletions vs merge-base 1461d01ae45 (32 files / +4,293 including .artifacts evidence)',
    test_counts_measured: {
      'tests/unit/solomon/ (2 files)': 71,
      'tests/unit/solomon/trend-eyes-probes.test.js': 57,
      'tests/unit/solomon/chairman-sms-exchanges.test.js': 14,
      trajectory: '23 -> 38 -> 62 -> 68 -> 71',
      note: 'The number 71 is the DIRECTORY total. It has been reported elsewhere as the single file\'s count; the single file is 57. Recorded here because a correct count attached to the wrong extent is one of this SD\'s own findings.',
    },
    mutation_campaigns: {
      first: '23 mutants, 14 surviving (39% kill rate) — evidence a9119a85, CONDITIONAL_PASS',
      recheck: '60 mutants, 37 killed, 23 survived (61.7%) — evidence 77dbfe52, CONDITIONAL_PASS conf 90',
      not_applied: '0 — every mutant asserted to match its search string exactly once before being believed',
      named_survivors_then_killed: ['M3 (24h threshold unpinned)', 'M9 (downward-only T3)', 'M21 (future-dated receipt read as fresh)', 'M23 (hardcoded category literal)', 'M49 (runSweep ?? [] — THE central fix, undone at the consumer)', 'M43 (Math.min clamp re-added)', 'M33 (watchdog exclusion neutered; live 2 -> 3 firing classes)', 'M46/M47/M48 (writeCandidates cap, truncation, dedup key)'],
      harness: '.artifacts/qa-recheck/mutate.mjs, results in .artifacts/qa-recheck/mutation-results.json',
    },
    corpus_measurements: {
      classifier_population: '342 (exact count(head) then paginated; fetched===population asserted — not a sample)',
      automated_excluded: 76,
      non_automated: 266,
      classified: 24,
      unclassified_null: 242,
      unclassified_rate_non_automated: '91.0%',
      prior: '328 of 342 -> null (95.9%)',
      honest_delta: 'Of the 86-row apparent improvement, 76 are the watchdog EXCLUSION; actual classification went 14 -> 24 (net 10)',
      sms_mentions: 97,
      sms_coverage_assigned: '1 (a 2026-07-21 relay test, not a coverage question)',
      founding_case: 'All three chairman bodies (2026-08-03T10:17:12Z, 2026-08-05T11:19:37Z, 2026-08-05T11:54:20Z) classify to null — T1 cannot fire on the SD\'s own charter specimen',
      t2_corpus: 'fix_shipped_at populated in 0 of 3,786 rows; lesson_class in 0 — T2 answers UNKNOWN on live data',
      t2_survivor_table: 'session_coordination 3,725 rows spanning ~2 weeks, 84% from the last 7 days — measures the DELETION POLICY; now UNIONed with retention_archive (44,003 rows back to 2026-03-11)',
      t3_chain_coverage: '0.00% — issue_patterns.source_feedback_ids is a NON-NULL EMPTY ARRAY on all 1,693 rows (407 of an exact 407 in the 60-day window)',
      t3_key_disjunction: 'Lane keys feedback/harness-bug/stuck vs pattern_ids PAT-AUTO-b442fd90 — measured overlap 0 over 60 days',
      cap_caught: 'First lane fetch returned exactly 1000 rows against a true population of 3,894 (Supabase default cap) — detected, not reported around',
    },
    rls_verification: {
      chairman_decision: '74f2a2c9 (verbatim "Yes", 2026-08-07T12:58:56Z, capture 54769df1, relayed via Adam a31ae727)',
      transcription_ruling: 'a63434fb (verbatim "Yes", 2026-08-07T15:43:36Z, capture 5d86e2e3) — scribe-executed at the chairman\'s live direction',
      apply: 'MIGRATION_APPLY_PROD_PASS from the apply seat; content sha256 799110f2 verified byte-identical beneath the transcribed header. A worker seat structurally CANNOT run the apply (chairman 3-factor path); the denial is the deliberate boundary, not the stochastic classifier-denial class.',
      catalog_arm: 'pg_policies: exactly one row — polname=trend_eyes_receipt_service_role_only, polpermissive=FALSE (restrictive), roles={anon,authenticated}, qual=(dimension IS DISTINCT FROM \'trend_eyes_sweep_receipt\')',
      behavioural_arm: 'Minted authenticated JWT via scripts/solomon/trend-eyes-receipt-rls-probe.mjs --verify: seeded receipt INVISIBLE at 0 where the pre-apply baseline proved the identical seed visible at 1; non-receipt 3976 vs 3976 by service-role at the SAME INSTANT (scope, not over-breadth)',
      pre_apply_baseline: '.artifacts/receipt-rls-baseline.json — captured 2026-08-07T16:28:23Z, receipt_visible 1 / non_receipt 3965. NOT re-obtainable; do not delete.',
      sequencing_rule: 'DO NOT MERGE until applied AND read back. The workflow ships an ACTIVE 06:00 schedule; merging first makes the sweep eligible to write its first receipt into a table still carrying the blanket March authenticated SELECT. Zero receipts existed — that is the entire timing argument, and merge-first spends it.',
      probe_self_defects_fixed: ['baseline-number comparison fired on unrelated inserts (3965 -> 3966 -> 3967) and reported an INCREASE as OVER-BROAD; now same-instant vs service-role', 'process.exit inside try skipped finally, leaking the seed on the FAILURE path; two orphans deleted, cleanup now proven on that path', 'the `return` that fixed the leak made the trailing process.exit unreachable, so a FAILED verify exited 0; exitCode now module-scoped and applied after main resolves'],
    },
    filename_blind_spot: {
      planned: 'scripts/solomon/trend-eyes-scan.mjs',
      shipped: 'scripts/solomon/trend-eyes-sweep.mjs',
      detector: 'lib/invocation-detector/requires-invocation.js:26 matches -(loop|cron|sweep|sweeper|daemon|worker|autotriage); :23 matches only cron/clockwork dirs',
      prior_victims: ['scripts/eva/eva-trend-snapshot.mjs', 'scripts/eva/trend-detector.mjs — both shipped UNWIRED under SDs marked COMPLETED'],
      pinned_by: 'TS-12 (both directions)',
    },
    workflow: {
      file: '.github/workflows/solomon-trend-eyes-sweep.yml',
      schedule: "0 6 * * * (ACTIVE, not commented out)",
      security: 'No job-level env; secrets appear exactly once at step level on the single Supabase-talking step. Top-level permissions contents:read. npm ci --ignore-scripts. The dry_run input is a typed boolean, not injectable; on the schedule trigger it resolves to an empty string.',
    },
    wider_regression: {
      command: 'npx vitest run --project unit',
      result: '2,962 test files passed / 1 failed; 36,194 tests passed, 2 failed, 199 skipped',
      failures_attributable_to_this_sd: 0,
      failure_cause: 'ANSI/FORCE_COLOR artifact in tests/unit/complete-quick-fix/external-timeout-and-coverage-gate.test.js — spawns `node -e console.log(Number)` and compares stdout to a bare numeral; passes under FORCE_COLOR=0. This SD has 0 deletions and touches only lib/solomon, scripts/solomon, tests/unit/solomon, .github/workflows and .artifacts.',
    },
    sub_agent_evidence: {
      Explore_LEAD: '7d07830b-6b39-49bc-b88b-3e9ac855dd99',
      VALIDATION_LEAD: 'd539b2c6-4c21-4fc6-ab29-482f46f8262c',
      TESTING_PLAN: '214a7dde-52ff-4ded-8283-3b8c2b538a1b',
      TESTING_EXEC_first: 'a9119a85-7c6b-4a47-b292-10f25c011b97 (CONDITIONAL_PASS, 14 of 23 mutants surviving)',
      SECURITY_EXEC_first: 'c7937d18-e18f-4480-a7fa-ca3bf7fc6862 (FAIL — SEC-TE-01 phantom columns, SEC-TE-02 false all-clear)',
      TESTING_EXEC_recheck: '77dbfe52-b36a-43ad-965d-72722fdfce3e (CONDITIONAL_PASS, conf 90 — found M49/M43/M33 and the founding-case gap)',
      SECURITY_EXEC_recheck: '42357fdf-41cd-4147-b5bb-0352c37abcea (CONDITIONAL_PASS, conf 95 — SEC-TE-03 disjoint namespaces, SEC-TE-04 FLAT on a too-short series)',
      VISION_FIDELITY_PLAN_VERIFICATION: 'a1aa2ac4-a317-4d62-845d-f046b66186f5',
    },
    decisions_not_to_relitigate: {
      T3: 'DESCOPED from V1 by Solomon (via Adam a31ae727) after his counterfactual was MEASURED. Return trigger must test NON-EMPTY, never non-null. Encoded as T3_DESCOPE and pinned by test; prints on every receipt.',
      filename: 'The entrypoint MUST keep a -sweep suffix (INVOCATION_PATH_PROOF is name-keyed).',
      receipt_contents: 'NOT redacted, per the SECURITY sub-agent: classifier_coverage is the anti-narrowing instrument, so removing it reinstates blindness while leaving the more sensitive topic labels in place. The content is required; the ACCESS was what was wrong.',
    },
    design_provenance: {
      commissioned_by: 'chairman_sms',
      designed_by: 'solomon',
      go_verbatim: "I approve Solomon's trend design",
      commission_advisory: '3a24dd84-bede-4fca-ab9d-ce0cc171144a',
      design_advisory: '933675c0-0981-4074-96a1-899b6b80919d',
      delta_advisory: '0b14c1bf-6f72-4a11-affe-264ac8581983',
    },
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    open_technical_debt: [
      'sms-coverage class not operational on the founding case (242 of 266 non-automated rows unclassified)',
      'T3 descoped pending a lane-to-pattern provenance key',
      'trend-eyes-liveness cannot distinguish a real receipt from a probe seed',
      'branch unmerged with no PR and no expiry on the (now-cleared) hold',
    ],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { data: existing } = await s
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`SD_COMPLETION retrospective already exists (id: ${existing[0].id}, created_at: ${existing[0].created_at}) — no new row needed.`);
    return;
  }

  const { data: ins, error: insErr } = await s
    .from('retrospectives')
    .insert(retro)
    .select('id, created_at, retro_type, status, quality_score, sd_id')
    .single();

  if (insErr) {
    console.error('INSERT FAILED:', insErr.message, insErr.details || '', insErr.hint || '');
    process.exit(1);
  }
  console.log('INSERTED:', JSON.stringify(ins, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
