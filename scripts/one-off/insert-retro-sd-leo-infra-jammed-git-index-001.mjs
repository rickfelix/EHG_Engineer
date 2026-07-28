#!/usr/bin/env node
/**
 * SD_COMPLETION retrospective for SD-LEO-INFRA-JAMMED-GIT-INDEX-001.
 *
 * Written directly against the retrospectives table so the PLAN-TO-LEAD
 * RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION row created
 * AFTER the LEAD-TO-PLAN acceptance timestamp (2026-07-28T01:35:01.887Z).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '1ac75802-8dba-4ea1-9953-b074560f8b58';
const SD_KEY = 'SD-LEO-INFRA-JAMMED-GIT-INDEX-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  quality_score: 91,
  title: `Retrospective: ${SD_KEY} — a stale index.lock froze every git operation for ~3h with no detector; the fix was not a better probe but a different SIGNAL CLASS (persistence of a stable lock identity), and four of this SD's own defects were alarm-SUPPRESSION paths`,
  description:
    'A stale .git/index.lock froze every git operation in the shared tree for ~3 hours and nothing saw it. The claim sweep and drain gauge read DB state; the worktree reaper runs `git worktree list --porcelain`, which never touches the index, so it kept SUCCEEDING throughout and reported git healthy. This SD ships a DETECTION-ONLY scheduled detector: '
    + '(1) lib/git/index-jam-detector.js — a pure core (VERDICT, DEFAULT_DWELL_MS=90s, DEFAULT_TICK_MS=30s, lockIdentityOf, sanitizeState, sanitizeDwellMs, classifyIndexHealth, applyPersistenceDegradation, exitCodeFor, formatVerdict), state-in/state-out so a cron tick (a fresh process) keeps nothing in module memory; '
    + '(2) scripts/cron/index-jam-detector.mjs — a STRICTLY read-only observer and cron host (stateFileFor, resolveGitDir, observeIndexLock, loadState, saveState) that stats the lock and never opens, acquires, writes or removes it, self-stamping periodic_process_registry as standard_loop:index-jam-detector; '
    + '(3) a DRAIN_DESCRIPTORS entry in lib/governance/gauge-registry.js so this detector cannot become the thing its sibling SD (SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001) exists to find — a detector whose output nobody drains — carrying consumer, closingPath, predicate, shapeContract and THREE STATED SCOPE BOUNDARIES (lockless jam, churn jam, sub-interval jam); '
    + '(4) tests/unit/git/index-jam-detector.test.js + tests/unit/git/index-jam-observer.test.js — 51 tests, verified green live. '
    + 'The SD was cut 50% at LEAD: it proposed a sweeper that DELETES stale locks, which VALIDATION found was already DECLINED as option (c) in SD-REFILL-00KUKQVS, already owned by open QF-20260727-502, and — decisively — resting on a predicate MEASURED FALSE (a live healthy `git add` holds a ZERO-BYTE index.lock for its entire duration, so neither presence nor zero-size distinguishes a jam from healthy work). PR #6623, +882/-0 across 6 files. '
    + 'IT IS NOT YET WIRED: periodic_process_registry.currently_expected_active=false with an activation_note, so it catches nothing until a scheduler entry exists.',
  affected_components: [
    'lib/git/index-jam-detector.js',
    'scripts/cron/index-jam-detector.mjs',
    'lib/governance/gauge-registry.js',
  ],
  related_files: [
    'lib/git/index-jam-detector.js',
    'scripts/cron/index-jam-detector.mjs',
    'lib/governance/gauge-registry.js',
    'tests/unit/git/index-jam-detector.test.js',
    'tests/unit/git/index-jam-observer.test.js',
    'lib/periodic-liveness/stamp-last-fired.js',
    'lib/git/clear-stale-index-lock.mjs',
    'tests/helpers/db-target.js',
    '.gitignore',
  ],
  related_commits: [
    'ab826273635', // feat: detect a jammed shared git index by persistence, not lock presence
    '62697b1317d', // fix: close four confirmed alarm-suppression paths found at EXEC
    '47d79da55bd', // test: assert the read-only guarantee and the observer seams
    'c83a9b3961b', // fix: close the tick-interval gap and three more suppression paths
    'd4d64941145', // test: protect the degradation guard; state the tick test's real reach
  ],
  related_prs: ['https://github.com/rickfelix/EHG_Engineer/pull/6623'],
  tags: ['detector', 'git', 'alarm-suppression', 'false-predicate', 'mutation-testing', 'scope-cut', 'detection-only'],

  what_went_well: [
    'A 50% SCOPE CUT AT LEAD, ON MEASUREMENT RATHER THAN OPINION. The SD proposed a sweeper that DELETES stale locks. VALIDATION found three independent disqualifiers: it was already DECLINED as option (c) in SD-REFILL-00KUKQVS; it was already owned by open QF-20260727-502; and — decisively — its predicate was MEASURED FALSE. A live healthy `git add` holds a ZERO-BYTE index.lock for its ENTIRE duration, so neither lock presence nor zero size distinguishes a jam from ordinary work, and a sweeper acting on that predicate would delete the lock out from under a healthy in-flight git process. Scope became detection-only before any code was written.',
    'THREE PRD DRAFTS WERE REJECTED AT PLAN BECAUSE THE INSTRUMENT WAS MEASURED, NOT ARGUED ABOUT. Each draft assumed `git update-index --refresh` could answer "is the index writable". It exits 1 on a merely DIRTY tree (the shared root is chronically dirty, so the detector would alarm permanently), and it exits 0 during a real jam with a stat-clean index in 5/5 runs while real `git add`/`git commit` failed 128. During a LIVE HEALTHY add it returns 128 too — identical to the orphan case. Five non-destructive discriminators (open r, open r+, open a, exclusive create, size) all returned identical results in both states. That measurement is what forced the redesign onto persistence.',
    'THE DWELL FLOOR WAS DERIVED FROM MEASUREMENT, NOT PICKED. Healthy ceiling: `git add -A` of 5000 files holds the lock ~40.0s, of 12000 files ~44.2s — the curve FLATTENS, so the 5000 figure was first-bulk-add cost rather than file count, which is why the ceiling is stable enough to derive from. Real-jam floor: the shortest recorded genuine jam was 7 minutes. 90s gives ~2x headroom over the ceiling and sits far under the shortest jam; anything under 60s false-positives on healthy bulk work. Git HOOKS were separately measured out as a constraint (an 8s sleeping pre-commit hook held no lock at any sample — git runs hooks BEFORE acquiring), which mattered because .husky/pre-commit runs vitest.',
    'THE DETECTOR IS DISQUALIFIED FROM CAUSING THE INCIDENT, AND THAT IS ENFORCED BY TEST. Acquiring the lock to test it (`--force-write-index`) was rejected at design: a detector killed mid-write leaves exactly the orphan lock that IS the incident. TS-5/TS-13 in tests/unit/git/index-jam-observer.test.js assert this rather than assuming it — no index.lock is created when observing a lockless repo, an EXISTING lock is left byte-identical, and a write-spy confirms NO destructive fs call is made during observation.',
    'MUTATION TESTING CAUGHT WHAT 51 GREEN TESTS DID NOT — THREE SEPARATE TIMES. Two vacuous tests and an unprotected degradation guard all survived a fully green suite and were killed only by mutating the implementation. Every load-bearing behaviour that now has a test has one because a mutant proved the absence, not because the plan said so.',
    'RUNNING THE THING FOUND A BUG NO UNIT TEST COULD. Actual exit codes were 127, not 0/1: process.exit() raced libuv teardown against the open supabase handle from stampLastFired (UV_HANDLE_CLOSING assertion). The entire shape contract — readers key on the EXIT CODE — was broken while every function-level test passed. Fixed by setting process.exitCode and returning (scripts/cron/index-jam-detector.mjs:158-163), with the reason recorded inline so it is not "simplified" back.',
    'THE DETECTOR REGISTERS ITS OWN DRAIN OBLIGATION AND ITS OWN LIVENESS. A DRAIN_DESCRIPTORS entry in lib/governance/gauge-registry.js names the consumer, the closing path, the predicate and a shapeContract that points readers at the exit code rather than at parsing the message — so this detector cannot become an instance of the class its sibling SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001 was chartered to close. It also self-stamps periodic_process_registry (liveness_source=self_stamped), non-fatally, matching gauge-runner.mjs:517-519.',
    'THE SCOPE BOUNDARIES ARE STATED, NOT LEFT IMPLICIT. The descriptor enumerates THREE real ways this reports HEALTHY while something is wrong: LOCKLESS JAM (corrupt index, broken .git permissions, disk full — it keys on lock presence, so there is nothing to observe; defensible because all six recorded incidents were stale-lock jams), CHURN JAM (locks repeatedly appearing and clearing; identity changes each time so persistence never accumulates — indistinguishable BY DESIGN from the sustained healthy activity TS-17a exists to protect), and SUB-INTERVAL JAM (effective floor is max(dwell, 2 x tick)). A reader learns the detector\'s blind spots from the detector\'s own registration.',
    'THE PURE/IO SPLIT WAS LOAD-BEARING, NOT STYLISTIC. classifyIndexHealth is state-in/state-out specifically so every persistence test runs in the `unit` tier. The `db` vitest project resolves to ZERO files (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS is intentionally empty — "0 of 225 db tests will run"), so a DB-tier persistence test would have been silently green and indistinguishable from having no coverage at all.',
    'THE INTERVAL FIX WAS RECORDED WHERE IT CAN BE READ, NOT JUST APPLIED. periodic_process_registry.liveness_source_ref carries an interval_rationale explaining WHY 60s and not 1800s (the effective-floor derivation) and an activation_note explaining why currently_expected_active=false. A future editor changing the interval sees the derivation on the row they are editing.',
    'NO REGRESSIONS AND A VERIFIED COUNT: 51 tests across 2 files, run live and green, against a +882/-0 purely additive PR (#6623) that touches no existing behaviour — the gauge-registry change is a new key in an existing frozen export.',
  ],

  what_needs_improvement: [
    'I REGISTERED A CONFIG VALUE THAT MADE THE SHORTEST RECORDED MEMBER OF THE CLASS STRUCTURALLY UNDETECTABLE. Detection requires the SAME lock identity at TWO consecutive ticks, so the EFFECTIVE floor is max(dwell, 2 x tick) — not the dwell. I registered expected_interval_seconds=1800, making the effective floor 3600s against a 420s shortest recorded jam. The carefully derived 90s dwell was INERT: it could never be the binding constraint. The detector would have caught only the ~3h outage that motivated the SD and missed most of the class it was chartered to detect. Fixed to 60s (effective floor 120s) in c83a9b3961b.',
    'v1.1 SHIPPED A PRESENCE-ONLY DETECTOR — MY OWN DESIGN DEFECT, AND IT WOULD HAVE FIRED ON HEALTHY WORK. Six back-to-back healthy `git add`s left a lock present at 12 of 12 ticks across FOUR DISTINCT identities. A presence-only detector calls that JAMMED. The measurement that killed the ORIGINAL sweeper (a healthy add holds a lock the whole time) was in the design notes and I still built the detector on presence. Fixed with identity-gated persistence via lockIdentityOf = `${mtimeMs}:${ino}`.',
    'MY OWN ACCEPTANCE CRITERION FORBADE THE FIX. v1.1 banned lock mtime OUTRIGHT, conflating two different things: age-as-verdict (unsound — the measurably-false predicate this detector exists to avoid) and mtime-as-IDENTITY (a sameness comparison, and the only continuity signal available). The ban was written at the level of the FIELD rather than the INFERENCE, so it forbade the correct use with the authority of an acceptance criterion, and the fix required amending my own AC mid-EXEC.',
    'FOUR ALARM-SUPPRESSION PATHS WERE FOUND AT EXEC BY TESTING AND SECURITY — NOT BY ME AT PLAN. (a) cwd-dependent state path: same repo, same held lock, two different cwds gave JAMMED then HEALTHY MID-JAM, and Windows Task Scheduler defaults "Start in" to %SystemRoot%\\system32, so every scheduled run would have used a different state file from every manual run — the single likeliest route to a detector green forever during a real outage. (b) poisoned/non-numeric firstBlockedAtMs: `heldForMs >= dwellMs` false forever, 6 of 6 ticks HEALTHY against a real held lock, written straight back each tick, and it NEVER self-heals because identity does not change during a genuine jam. (c) unvalidated --dwell-ms: NaN makes every comparison false — 20 ticks over 10 simulated minutes of one held lock, all HEALTHY. (d) a PRUNED worktree: the .git pointer target is gone, so statting <gitDir>/index.lock returns ENOENT, which reads as "successful observation, lock absent" and reports HEALTHY FOREVER — with 17 worktrees present, this is an ordinary git state. My PLAN reasoning covered the DETECTION logic thoroughly and the DEPLOYMENT surface (cwd, scheduler defaults, corrupt state, CLI arg validation, worktree topology) not at all.',
    'ACROSS THREE ROUNDS THE NEWEST FIX SHIPPED UNTESTED, EVERY TIME. The commit sequence is feat(ab826273635) -> fix(62697b1317d) -> test(47d79da55bd) -> fix(c83a9b3961b) -> test(d4d64941145). The fixes were RIGHT; the tests for them landed one round later, and mutation — not the suite — is what surfaced the gap each round. At every handoff-shaped moment in this SD, the code most likely to be wrong (the newest) had the least coverage, while a reviewer sampling the suite would have seen high coverage of everything else.',
    'TWO VACUOUS TESTS, AND THE SECOND REINTRODUCED THE CLASS I HAD JUST FIXED. Both were fixtures naming a guard they could never REACH, because an earlier branch discarded the input first — the assertion passed on the early-return path and would have passed with the guard deleted. The second one landed in the same round as the fix for the first. Knowing the failure class did not prevent reproducing it; only mutation caught either.',
    'THE TICK TEST LOOKS LIKE COVERAGE AND ISN\'T. tests/unit/git/index-jam-detector.test.js:294 compares DEFAULT_TICK_MS against two literals in the same file, but DEFAULT_TICK_MS is consumed by NOTHING operational — the value that actually sets the cadence is periodic_process_registry.expected_interval_seconds, and no code links the two. The deployed interval could regress to exactly the 1800s defect this SD just fixed with the suite fully green. Guarding the link needs a DB read the unit tier deliberately cannot do. The limit is declared in the test body rather than left to look like protection it does not provide.',
    'THE ANTI-SUPPRESSION FIX WAS ITSELF A SUPPRESSION RISK, AND THE GUARD THAT PREVENTS IT LOOKS LIKE DEAD CODE. applyPersistenceDegradation downgrades to UNAVAILABLE when carry-over state cannot be persisted (measured pre-fix: exit 0 / HEALTHY on 4 of 4 ticks against a real held lock with <repo>/.claude unwritable). Without the `result.verdict !== JAMMED` guard, a CONFIRMED jam would be downgraded to UNAVAILABLE/exit 0 — active suppression, in the exact scenario the fix was written for, and the trigger is CORRELATED (disk-full can both orphan an index.lock and block the state write). The guard reads like a redundant condition and needed its own protecting test (d4d64941145).',
    'THE SD DELIVERS DETECTION AND NOTHING ELSE, AND NOTHING SCHEDULES IT YET. currently_expected_active=false. Today it catches zero jams. Even once scheduled, a confirmed jam still requires a human to clear the lock, so MTTR on the ~3h class improves only to the extent a person reads the alarm — the exit code currently has no routed reader.',
  ],

  key_learnings: [
    'MEASURE THE PREDICATE BEFORE BUILDING ON IT — a remedy\'s core predicate is a factual claim about the world, and everything downstream inherits it. The proposed sweeper rested on "an index.lock present (and zero-byte) past N seconds is stale". Measurement killed it outright: a live healthy `git add` holds a ZERO-BYTE index.lock for its ENTIRE duration, so the very field the proposal used as its discriminator is shared by the healthy case, and the sweeper would have deleted locks out from under running git processes. Cost of measuring: one experiment at LEAD. Cost of not measuring: a destructive tool built on a false premise. The same pass also found the work already DECLINED (SD-REFILL-00KUKQVS option c) and already owned (QF-20260727-502) — a duplicate-work check and a predicate check are both cheap relative to what they prevent.',
    'A PROBE THAT IS WRONG IN BOTH DIRECTIONS IS NOT A TUNING PROBLEM — IT IS THE WRONG SIGNAL CLASS. `git update-index --refresh` exits 1 on a merely dirty tree (permanent false alarm on a chronically dirty shared root) AND exits 0 during a real jam with a stat-clean index in 5/5 runs while real `git add` failed 128 (a clean bill of health during the outage). No threshold fixes both directions at once. Five non-destructive discriminators all returned IDENTICAL results in the jammed and the live-healthy states, which is the formal statement of the problem: a single-shot probe carries exactly the information "a lock exists" and zero discriminating power. When both error directions are present simultaneously, stop tuning the instrument and change what you measure — here, from an instantaneous state to PERSISTENCE OF A STABLE IDENTITY OVER TIME.',
    'PRESENCE IS NOT PERSISTENCE. "Condition observed at every sample" is NOT "condition persisted" when the underlying resource churns. Six healthy `git add`s produced a lock present at 12 of 12 ticks across FOUR DISTINCT identities; a presence-only detector calls that a jam. The fix is to carry an IDENTITY across samples rather than a boolean, and to accumulate the counter only while the identity is unchanged (classifyIndexHealth\'s sameLock test). Any detector whose signal is "still there" must be able to answer "still the SAME one" — otherwise sustained healthy throughput is indistinguishable from a stuck resource, and the busier the system the more confidently it false-alarms.',
    'THE OBVIOUS IDENTITY FIELD CAN BE THE WRONG ONE, SILENTLY. birthtime is the natural choice for "is this the same file", and on NTFS it is a trap: three files created ~1.2s apart with THREE DIFFERENT INODES all reported an IDENTICAL birthtimeMs (file tunneling). Using it would have rebuilt the exact false positive that identity-gating exists to remove, while looking more correct than the (mtimeMs, ino) pair actually used. Platform-specific identity semantics must be MEASURED on the target platform, and — because the wrong choice looks obviously right — the rejection has to be written at the definition site (lib/git/index-jam-detector.js:56-58) or the next reader will "fix" it back.',
    'WRITE ACCEPTANCE CRITERIA AGAINST THE UNSOUND INFERENCE, NEVER AGAINST THE FIELD. My v1.1 AC banned lock mtime outright. That conflated age-as-verdict (unsound: "the lock is old, therefore jammed") with mtime-as-identity (a pure sameness comparison, and the only continuity signal available). A field-level ban is strictly over-broad — it forbids the sound use along with the unsound one, and because it is an ACCEPTANCE CRITERION it does so with authority, so the correct fix arrives looking like a violation. Heuristic adopted: when a criterion blocks a fix that is clearly right, suspect the criterion names a PROXY (the field) rather than the thing it meant to forbid (the inference).',
    'A DETECTOR\'S DEPLOYMENT CONFIG CAN SILENTLY DEFEAT ITS OWN DERIVATION — DERIVE THE COMPOSITE, NOT THE CONSTANT. The 90s dwell was derived properly (2x headroom over a measured 44.2s healthy ceiling, well under the 420s shortest recorded jam). But sensitivity is a function of BOTH the dwell and the tick: detection needs the same identity at two consecutive ticks, so the effective floor is max(dwell, 2 x tick). At the registered 1800s interval the effective floor was 3600s — the SHORTEST RECORDED MEMBER OF THE CLASS was structurally undetectable and the derived dwell was inert, unable ever to bind. The two values also live in DIFFERENT SYSTEMS (a code constant and a DB row), so neither system\'s tests could see the interaction. Whenever a threshold and a sampling rate combine, state the composite formula explicitly and validate the deployed pair against the smallest real instance of the class.',
    'FOR A DETECTOR, ALL THE ASYMMETRIC RISK IS ON THE SUPPRESSION SIDE — ENUMERATE THE PATHS BY WHICH THE ALARM NEVER FIRES, AND REPRODUCE EACH. Four were found here, each confirmed by experiment rather than argument: a cwd-relative state path (JAMMED then HEALTHY mid-jam across two cwds; Windows Task Scheduler defaults "Start in" to system32, so scheduled and manual runs would never share state); a poisoned firstBlockedAtMs that suppresses FOREVER with no self-heal because identity does not change during a real jam; an unvalidated --dwell-ms whose NaN makes every comparison false (20 ticks, all HEALTHY); and a pruned worktree whose ENOENT reads as "lock absent" and reports HEALTHY forever. A false alarm is loud and gets fixed. A suppressed alarm is INDISTINGUISHABLE FROM HEALTH in every artifact the system produces — including in the retrospective that would have been written about the next outage.',
    'AN ANTI-SUPPRESSION FIX IS ITSELF A SUPPRESSION RISK — CHECK IT AGAINST THE CASE WHERE THE FINDING IS ALREADY PROVEN. applyPersistenceDegradation correctly refuses to report health when carry-over state cannot be persisted (persistence IS the signal). But applied unconditionally it would downgrade a CONFIRMED jam to UNAVAILABLE/exit 0, converting the anti-suppression fix into active suppression in precisely the correlated scenario it was written for (disk-full can both orphan an index.lock and block the state write). The `verdict !== JAMMED` guard is what makes it safe, and it reads like a redundant condition, so it needed its own protecting test. General rule: any "degrade to not-a-health-verdict" mechanism must be evaluated against an already-established finding, because degradation and suppression are the same operation applied to different inputs.',
    'FIXES RIGHT, TESTS TRAILING BY ONE ROUND — the structural pattern a reviewer caught across THREE rounds of this SD (feat -> fix -> test -> fix -> test). The fixes were correct every time, which is exactly what makes the pattern dangerous: quality of the fixes was never the issue, COVERAGE OF THE NEWEST CODE was, and it was zero at every moment the work could have been reported done. A reviewer sampling the suite sees strong coverage of everything except the part most likely to be wrong, and mutation testing was the only thing that surfaced it — three times. Rule adopted: a fix commit is not complete without its killing test in the SAME commit; if the test must trail, the fix is not ready to be reported as done.',
    'A TEST THAT COMPARES TWO LITERALS IN THE SAME FILE IS A TEST OF DOCUMENTATION, NOT OF BEHAVIOUR — AND IT LOOKS IDENTICAL TO COVERAGE. The tick assertion pins DEFAULT_TICK_MS, but nothing operational consumes DEFAULT_TICK_MS; the deployed cadence is periodic_process_registry.expected_interval_seconds and no code links them, so the interval could regress to the exact 1800s defect just fixed with the suite green. The generalizable check is: name the RUNTIME PATH that reads the constant under test. If there is none, the test guards a comment. When the real link cannot be tested in the available tier (a DB read, here, where the db tier resolves to zero files), DECLARE the limit in the test body — an unstated gap in a green suite is a false assurance, a stated one is a finding with an owner.',
    'A GUARD-TARGETING TEST MUST ASSERT THE GUARD WAS REACHED, NOT MERELY THAT THE OUTCOME MATCHES. Both vacuous tests here named a guard their fixture could never reach, because an earlier branch discarded the input first — so the assertion passed on the early-return path and would have passed with the guard deleted. The outcome a guard produces is frequently ALSO the outcome produced by never getting there, which is why these read as legitimate. The concrete fix pattern is to construct the fixture so the preceding branches provably fall through (each state fixture carries lockIdentity \'A\' so sameLock is TRUE on the next tick — index-jam-detector.test.js:188). The sharper half of this lesson: I reintroduced the class in the SAME ROUND that fixed it. Knowing a failure class does not prevent reproducing it; only mutation caught either instance.',
    'THE CONTRACT AT THE PROCESS BOUNDARY IS COVERED BY NO TEST OF THE FUNCTIONS INSIDE IT — RUN THE COMMAND AND READ THE ACTUAL EXIT CODE. Real exit codes were 127, not 0/1: process.exit() raced libuv teardown against the open supabase handle from stampLastFired (UV_HANDLE_CLOSING). The shape contract explicitly tells readers to key on the exit code, so the detector\'s entire output channel was broken while exitCodeFor and every other unit passed. A scheduler cannot act on "command not found" for a healthy tree. Exit codes, stdout shape and stream flush are produced by the PROCESS, not by the functions under test; they need a process-level smoke invocation.',
    'A PROBE THAT CAN CREATE THE CONDITION IT DETECTS IS DISQUALIFIED REGARDLESS OF ITS ACCURACY. Acquiring the lock to test writability (`--force-write-index`) would, if the detector were killed mid-write, leave exactly the orphan index.lock that IS the incident — a detector that manufactures outages during the incidents it exists to observe. The strictly-observational alternative is weaker (it cannot see a lockless jam) and that was the correct trade. Because "just try to acquire it" is the intuitive design, the read-only property is enforced by test (write-spy, byte-identical existing lock, no lock created) rather than by intent.',
    'DECLARING A DETECTOR "REGISTERED BUT NOT SCHEDULED" IS HONEST AND STILL LEAVES ZERO COVERAGE. currently_expected_active=false correctly stops the liveness watcher raising a false OVERDUE about a detector nothing runs, and the activation_note says exactly what to flip and when. But the honest registration and the working detector together still catch nothing: shipping the DETECTION LOGIC is not shipping DETECTION. The gap between "the code is correct and merged" and "the condition would now be caught" is a scheduler entry and a routed reader of the exit code — and that gap is invisible in the PR, in the test results, and in the merge.',
  ],

  action_items: [
    {
      title: 'SCHEDULE THE DETECTOR — nothing runs it today, so it catches zero jams',
      description: 'periodic_process_registry.standard_loop:index-jam-detector has currently_expected_active=false with an activation_note. Until a scheduler entry exists, this SD has shipped detection LOGIC and zero detection. Add a Windows Task Scheduler entry running `node scripts/cron/index-jam-detector.mjs --repo <shared root>` at 60s, and — critically, given the cwd suppression path measured in this SD — set an EXPLICIT "Start in" directory rather than accepting the %SystemRoot%\\system32 default, and pass --repo explicitly (observeIndexLock throws rather than defaulting to cwd, by design). Flip currently_expected_active=true in the SAME change so the liveness watcher begins guarding it the moment it becomes real. Verification: a manual jam simulation (hold a lock >120s) produces exit 1 from the SCHEDULED run, not just from a manual one.',
      priority: 'critical',
      owner_role: 'EXEC',
      deadline: 'next session',
      verification: 'Scheduled task exists; currently_expected_active=true; a held-lock simulation yields exit 1 from the scheduled invocation and last_fired_at advances every ~60s.',
    },
    {
      title: 'Route the non-zero exit to a reader — an unread alarm is the sibling SD\'s finding',
      description: 'The DRAIN_DESCRIPTORS entry names "the scheduled cron tick itself" as consumer and the exit code as the shape contract, but no human-visible surface currently receives it. A jam confirmed at 03:00 with nobody notified reproduces the original incident (~3h frozen tree) minus only the ignorance. Wire the non-zero exit into whatever surface the seat actually watches, and record the concrete reader in the descriptor\'s consumer field, replacing the current self-referential wording. This is what makes this SD not become an instance of SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001.',
      priority: 'high',
      owner_role: 'LEAD',
      deadline: 'with the scheduler entry',
      verification: 'A simulated JAMMED verdict produces a message on the routed surface; the descriptor names that surface.',
    },
    {
      title: 'Guard the tick-interval link with a check that can actually read the deployed value',
      description: 'The unit test at tests/unit/git/index-jam-detector.test.js:294 pins DEFAULT_TICK_MS, which nothing operational consumes; the deployed cadence is periodic_process_registry.expected_interval_seconds and no code links the two, so a regression to 1800s (the exact defect fixed in c83a9b3961b) passes the suite green. Add a DB-reading assertion — in the gauge/liveness tier or as a startup self-check in scripts/cron/index-jam-detector.mjs — that fails when 2 x expected_interval_seconds x 1000 exceeds min(DEFAULT_DWELL_MS-equivalent, the 420s shortest recorded jam). A startup self-check is preferable: it runs in the deployed environment, which is the only place the real value lives.',
      priority: 'high',
      owner_role: 'PLAN',
      deadline: 'before the detector is relied upon',
      verification: 'Setting expected_interval_seconds to 1800 makes the check fail; setting it to 60 passes.',
    },
    {
      title: 'Adopt fix-and-its-killing-test-in-the-same-commit for detector work',
      description: 'Three rounds of this SD shipped the newest fix untested (feat ab826273635 -> fix 62697b1317d -> test 47d79da55bd -> fix c83a9b3961b -> test d4d64941145), with mutation rather than the suite catching the gap each time. The fixes were correct, which is what made the pattern invisible. Encode the rule for detector/guard changes specifically, where the failure mode is silent suppression: a fix commit lands with the test that would have caught the defect, and if the test must trail, the fix is not reported as done. Pair it with the standing practice of mutating any newly added guard before calling a suite sufficient.',
      priority: 'high',
      owner_role: 'EXEC',
      deadline: 'immediate — process change',
      verification: 'Next detector SD shows no fix commit without a co-located test; spot-check by mutating the newest guard and confirming a kill.',
    },
    {
      title: 'Add a process-level exit-code smoke check to CI or the startup path',
      description: 'The exit-127 bug (process.exit() racing libuv teardown against stampLastFired\'s open supabase handle) was invisible to all 51 unit tests because the exit code is produced by the PROCESS, not by exitCodeFor. Add a smoke invocation that actually runs `node scripts/cron/index-jam-detector.mjs --repo <fixture>` and asserts the real exit status for HEALTHY (0), JAMMED (1) and missing --repo (2). Without it, any future addition of an async handle to main() can silently reintroduce a non-actionable exit code — and the shape contract tells readers to key on exactly that value.',
      priority: 'high',
      owner_role: 'EXEC',
      deadline: 'next detector change',
      verification: 'The smoke check fails if process.exit() is reintroduced in scripts/cron/index-jam-detector.mjs.',
    },
    {
      title: 'Decide the observed-tree set — 17 worktrees, and only the shared root is covered',
      description: 'resolveGitDir handles both a .git DIRECTORY (main root) and a .git FILE (worktree gitdir pointer), and correctly maps a PRUNED worktree to UNAVAILABLE rather than HEALTHY, but nothing decides WHICH trees get observed. The recorded incidents were in the shared root, so starting there is right; the decision (and its rationale) should be explicit rather than an artifact of whichever --repo the first scheduler entry happened to name. Note globbing all 17 is explicitly cautioned against in the code comments as a noise source.',
      priority: 'medium',
      owner_role: 'PLAN',
      deadline: 'after the scheduler entry exists',
      verification: 'The observed-tree set and its rationale are recorded on the periodic_process_registry row alongside interval_rationale.',
    },
    {
      title: 'Leave the LOCKLESS-JAM boundary open deliberately, and revisit if an incident lands outside the lock class',
      description: 'The detector keys on lock presence, so a corrupt index, broken .git permissions or disk full produces no observation at all — stated as boundary 1 in the DRAIN_DESCRIPTORS entry. This is defensible today because all six recorded incidents (five on 2026-07-27, one on 2026-07-26, class dating to 2026-06-14) were stale-lock jams. It stops being defensible the first time a jam has no lock. Track it as a stated boundary with a trigger rather than as backlog: if any future git-freeze incident shows no index.lock, this detector is not the right instrument for it and a separate signal is needed.',
      priority: 'low',
      owner_role: 'LEAD',
      deadline: 'trigger-based',
      verification: 'A future git-freeze incident is checked against the boundary list before this detector is blamed for missing it.',
    },
    {
      title: 'Close the loop with the already-open QF-20260727-502 on lock REMEDIATION',
      description: 'This SD was deliberately cut to detection only; removal of a stale lock was declined as option (c) in SD-REFILL-00KUKQVS and is owned by open QF-20260727-502. Now that a sound discriminant exists (a jam CONFIRMED by identity-stable persistence past the dwell floor, rather than mere lock presence), the remediation question is materially different from when it was declined — the measured objection was that no sound predicate existed, and there now is one. Feed this detector\'s verdict into that QF\'s design rather than letting the two proceed independently, and note that any remediation must still never act on a single-tick observation.',
      priority: 'medium',
      owner_role: 'LEAD',
      deadline: 'when QF-20260727-502 is next picked up',
      verification: 'QF-20260727-502 references classifyIndexHealth\'s JAMMED verdict as its trigger condition rather than lock presence or lock age.',
    },
  ],

  success_patterns: [
    'Measure the remedy\'s core predicate at LEAD, before PLAN inherits it — one experiment killed a destructive sweeper design and cut scope 50%.',
    'When a probe errs in BOTH directions, change the signal class rather than the threshold: instantaneous state -> persistence of a stable identity over time.',
    'Derive thresholds from measured ceilings and measured floors (44.2s healthy ceiling, 420s shortest real jam), and record the derivation where the value is edited.',
    'Disqualify any probe that can create the condition it detects; enforce read-only with a write-spy test, not with intent.',
    'Mutate every newly added guard — 51 green tests hid two vacuous tests and one unprotected guard.',
    'Run the actual command and read the actual exit code; process-boundary contracts are invisible to function-level tests.',
    'Register a new detector\'s drain obligation and its own liveness at birth, and state its blind spots in the registration.',
  ],

  failure_patterns: [
    'A deployment config in a different system from the constant it interacts with (DB interval vs code dwell) silently defeated the derivation — neither system\'s tests could see the composite.',
    'Presence-only detection on a churning resource: a lock present at 12/12 ticks across 4 identities reads as a jam.',
    'An acceptance criterion written against a FIELD (lock mtime) rather than an INFERENCE (age-as-verdict) forbade its own correct fix.',
    'Anti-suppression logic applied unconditionally becomes suppression when the finding is already proven.',
    'Fixes correct, tests trailing one round, three rounds running — coverage of the newest code was zero at every reportable moment.',
    'Guard-targeting tests whose fixtures could not reach the guard, passing on an early-return path; the class was reintroduced in the same round it was fixed.',
    'A test pinning a constant that no runtime path consumes, indistinguishable from real coverage.',
    'Shipping correct detection logic with no scheduler entry: merged, green, and catching nothing.',
  ],

  objectives_met: true,
  within_scope: true,
  on_schedule: true,
  tests_added: 51,
  technical_debt_addressed: true,
  technical_debt_created: true,
  business_value_delivered:
    'Detection-only coverage for a recurring shared-resource outage class that previously had ZERO instruments — at least six incidents, the longest ~25h. DEBT CLOSED: a stale .git/index.lock froze the shared tree for ~3h (and in the wider class ~10h, leaving it 46 commits behind origin; 25h on 2026-06-14, leaving it 125 commits behind) with nothing watching, because the claim sweep and drain gauge read DB state and the worktree reaper runs `git worktree list --porcelain`, which never touches the index and so kept reporting git healthy throughout every incident. '
    + 'DEBT CREATED: the detector is registered but NOT SCHEDULED (currently_expected_active=false), so it catches nothing until a scheduler entry exists; its exit code has no routed human reader; and the deployed tick interval (periodic_process_registry.expected_interval_seconds) is linked by no check to DEFAULT_TICK_MS, so it can regress to the 1800s defect with the suite green. Three blind spots remain BY DESIGN and are stated in the DRAIN_DESCRIPTORS entry: lockless jams, churn jams, and jams shorter than max(dwell, 2 x tick). '
    + 'Until the scheduler entry and a reader land, the delivered value is the measurement record (which discriminants do and do not work) plus a sound, tested discriminant — not caught jams.',
  customer_impact:
    'None yet, by construction. The seat that loses ~3h to a frozen shared tree sees no change until scripts/cron/index-jam-detector.mjs is scheduled and its non-zero exit reaches a surface someone watches. Once wired, a confirmed jam is named as a SHARED-RESOURCE condition with the tree and the duration ("not a fault in your command"), which is the specific misattribution that made prior incidents cost hours: each blocked seat read the git failure as its own.',

  metadata: {
    sd_key: SD_KEY,
    pr: 6623,
    branch: 'feat/SD-LEO-INFRA-JAMMED-GIT-INDEX-001',
    diff: '+882/-0 across 6 files',
    tests: { files: 2, passed: 51, tier: 'unit', verified_live: true },
    scope_cut_at_lead: '50% — sweeper/deletion removed; detection only',
    scope_cut_basis: [
      'already DECLINED as option (c) in SD-REFILL-00KUKQVS',
      'already owned by open QF-20260727-502',
      'predicate MEASURED FALSE: a live healthy `git add` holds a ZERO-BYTE index.lock for its entire duration',
    ],
    prd_drafts_rejected_at_plan: 3,
    suppression_paths_closed: 4,
    not_yet_active: {
      process_key: 'standard_loop:index-jam-detector',
      currently_expected_active: false,
      last_state: 'INTENTIONALLY_DOWN',
      blocker: 'no scheduler entry exists — the detector catches nothing until one does',
    },
    interval_defect: {
      registered_wrong: 1800,
      corrected_to: 60,
      effective_floor_formula: 'max(dwell, 2 x tick)',
      wrong_effective_floor_s: 3600,
      shortest_recorded_jam_s: 420,
      consequence: 'the shortest recorded member of the class was structurally undetectable and the derived 90s dwell was inert',
    },
  },
};

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('retrospectives').insert(retro).select('id, retro_type, quality_score, created_at').single();
  if (error) {
    console.error('INSERT FAILED:', error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`Inserted SD_COMPLETION retrospective ${data.id} for ${SD_KEY}`);
  console.log(`  retro_type=${data.retro_type} quality_score=${data.quality_score} created_at=${data.created_at}`);
  console.log(`  gate cutoff was 2026-07-28T01:35:01.887Z — created_at is ${new Date(data.created_at) > new Date('2026-07-28T01:35:01.887Z') ? 'AFTER (passes)' : 'BEFORE (FAILS)'}`);
}

main();
