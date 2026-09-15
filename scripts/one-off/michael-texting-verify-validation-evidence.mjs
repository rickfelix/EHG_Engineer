#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 — VALIDATION evidence at VERIFY (PLAN verification).
 *
 * Independent re-verification of all 5 FRs against the LIVE PRD (product_requirements_v2, read at
 * run time) and the ACTUAL shipped code at HEAD 11316f20a78 — the whole of
 * scripts/michael/checkpoint-send.mjs read end to end, no prior summary trusted. Every negative
 * claim below ("this is genuinely pinned", "this mutation is caught") was established by MUTATION
 * TESTING the shipped module against the shipped suite, not by reading the diff's own comments.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 93,
    phase: 'VERIFY',
    execution_time_ms: 0,
    summary: "Independent VERIFY-phase re-verification of all 5 FRs against the live PRD and the shipped code. All five FRs are correctly implemented and the two EXEC-phase SECURITY findings are GENUINELY fixed in code (not merely claimed in a commit message) -- I reverted each and confirmed a dedicated test kills the mutant. I found ONE real, previously-undisclosed gap that both the EXEC TESTING and SECURITY reviews missed and that an explicit PRD acceptance criterion demanded: dropping `attempt` from readProducingFeederCounts's select list -- the exact defect TR-9 names 'the single most likely way for this SD to ship green tests over an unfixed verb' -- SURVIVED the suite at 55/55. The TS-1 assertion that claimed to pin it only asserted that a read against michael_feeder_runs occurred; because fakeSb never projects `select` (it returns whole fixture rows), NO row-based assertion can observe the select list, so the adversarial-fixture route the AC offered cannot in fact satisfy the AC. I fixed it in the test tier only (recorded read ops in fakeSb per TR-7, then asserted the select list contains 'attempt'); the mutant is now killed and production code was not touched. Verdict is CONDITIONAL_PASS on two small, precisely-stated residuals carried forward to LEAD: TS-20 (db tier) is still UNRUN by construction from this worktree (TR-10) and must be run from the main checkout post-merge, and FR-5's AC7 test limb ('a test must assert the production default is the real resolver') has no test -- though I verified that code property directly by reading the default binding and independently confirming the production resolver's call signature.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'MEDIUM',
        issue: "FOUND AND FIXED THIS REVIEW (test tier only, production code untouched). FR-2's TESTING-PIN and TR-9 both require that `attempt` be in readProducingFeederCounts's select list AND that a test assert it. The code side was correct (checkpoint-send.mjs:153 reads { select: 'attempt,counts,finished_at,status' }), but the TEST side was vacuous: checkpoint-send.test.js:437-439 carried the comment 'Confirms the select actually requested `attempt` (TR-9)' above an assertion that only checked `sb.froms.filter((t) => t === 'michael_feeder_runs').length > 0` -- i.e. that A READ HAPPENED, not what it selected. MEASURED: with `attempt` removed from the select list, the suite passed 55/55. The AC offered two satisfaction routes ('asserting the recorded select string contains attempt, OR via an adversarially-ordered fixture per TS-1') and EXEC took the fixture route -- but that route is IMPOSSIBLE to satisfy here, because fakeSb (checkpoint-send.test.js:31-32) applies eq-filters only and never projects `select`, so it hands back whole fixture rows with `attempt` present no matter what the select list says. TS-1's fixture also leaves only ONE finished row after the finished_at filter, so the max-by-attempt comparison is never even exercised by it. This is precisely the failure TR-9 predicted. FIX APPLIED: added a `reads` recorder to fakeSb (the read branch now retains its ops, mirroring what the write branch already did -- TR-7 explicitly says a test wanting to assert a query-level operator must inspect the recorded ops array, but reads were discarding them), and replaced the vacuous assertion with one that reads the recorded select argument and asserts it contains 'attempt'. Re-measured: the same mutation is now KILLED (1 failed | 54 passed), and the unmutated suite is 55/55 with all 548 michael-suite tests across 21 files still green.",
        evidence: "Mutation M1 `{ select: 'attempt,counts,finished_at,status' }` -> `{ select: 'counts,finished_at,status' }`: BEFORE fix -> 'Tests 55 passed (55)' (mutant SURVIVED). AFTER fix -> 'Tests 1 failed | 54 passed (55)', failing test is TS-1. File restored to md5 e688d3029cdfdfec90ec6e2e6c7ea5c4 (production module byte-identical to HEAD) after every mutation.",
      },
      {
        id: 'VAL-2',
        severity: 'LOW',
        issue: "RESIDUAL, NOT FIXED (reported instead, deliberately). FR-5's TESTING-PIN AC7 requires 'A test must assert the production default is the real resolver (the dep is undefined-by-default, not a permissive stub).' No such test exists. All 18 resolveQuietHours usages in the suite INJECT a double; the only two on-demand-flagged tests that omit the injection (TS-11, TS-19) never reach the resolver at all -- TS-11 is a fixed-window path where isOnDemand is false, and TS-19 returns at the SEC-H1 --et-date refusal (checkpoint-send.mjs:187) before the window branch. So the production default binding is exercised by zero tests. I verified the CODE property directly instead: checkpoint-send.mjs:180 binds `resolveQuietHours = resolveQuietHoursContext` -- the real imported resolver (imported at :77), undefined-by-default, not a stub. I did NOT add a test because the only unit-tier route is a brittle source-text assertion on runCheckpointSend.toString(), which is itself a printed-discriminator-style pin rather than a behavioural one; a real test would construct a live ChairmanPreferenceStore and hit the database, which is exactly what the AC's own sibling pin forbids. Recorded so the unmet limb is visible to LEAD rather than silently absorbed.",
        evidence: "grep -c 'resolveQuietHours:' scripts/michael/checkpoint-send.test.js -> 18 (all injections). An awk scan for tests whose body contains '--now' but no 'resolveQuietHours:' returns only TS-11 and TS-19, both of which return before the resolver is reached. checkpoint-send.mjs:180 default parameter read directly.",
      },
      {
        id: 'VAL-3',
        severity: 'LOW',
        issue: "RESIDUAL, STRUCTURAL, ALREADY DISCLOSED -- carried forward so it does not evaporate at LEAD. TS-20 (the db tier: on-demand window_slot NOT NULL + the partial unique index on (et_date, window_slot) WHERE outcome='sent') has NOT been run. TR-10 states the reason precisely: vitest.config.js's db project sets passWithNoTests:true and excludes the worktrees glob, so a db-tier run from THIS worktree collects zero tests and exits 0 -- indistinguishable from a passing run. TS-12 is the only unit-tier protection and it cannot enforce NOT NULL (the in-memory fake does not model column constraints). The schema claim is therefore currently evidenced by the DDL text plus an unexecuted test. This must be run from the MAIN checkout post-merge; it is an obligation, not a formality, and TR-10 explicitly forbids presenting a bare worktree exit-0 as evidence it ran. This matches the EXEC-phase SECURITY review's third recommendation.",
        evidence: "TR-10 in the live PRD's technical_requirements; tests/ddl/michael-checkpoint-send-ddl.db.test.js header documents the same constraint. Not re-measured here -- re-running it from this worktree would reproduce exactly the misleading exit-0 TR-10 warns about.",
      },
      {
        id: 'VAL-4',
        severity: 'LOW',
        issue: "OBSERVATION, NOT A DEFECT -- an internal tension in the PRD that the implementation resolved correctly but that nothing records. FR-1's AC5 says '--now WITHOUT --apply stays a dry-run and must return the existing dry_run shape with the on-demand window_slot -- never a send', while FR-1's guard-order TESTING-PIN says the quiet-hours check sits '...BEFORE the dry-run return'. These conflict for one input: a --now dry-run INSIDE quiet hours, which returns a QUIET_HOURS refusal rather than the dry_run shape. The implementation follows the guard-order pin (checkpoint-send.mjs:220-248 precedes the dry-run return at :250), which is the right call -- it is the more specific, later-added pin, and AC5's load-bearing clause ('never a send') still holds. Worth noting positively: the code is careful here, gating the quiet-hours ledger write on `if (isApply)` at :237, so a dry-run inside quiet hours still writes NO ledger row and FR-6's dry-run rule is not weakened. TS-18b tests the dry-run shape at 08:00 ET (outside quiet hours), so it does not collide with this. No change recommended; recorded so a future reader does not file it as a bug.",
        evidence: "checkpoint-send.mjs:220 (quiet-hours block start) vs :250 (`if (!isApply)` dry-run return); :237 `if (isApply)` gating the QUIET_HOURS ledger insert. FR-1 AC5 and FR-1 guard-order TESTING-PIN, both read from the live PRD this run.",
      },
    ],
    recommendations: [
      "Accept the VAL-1 test fix as part of this SD -- it closes an explicit, currently-unmet PRD acceptance criterion (FR-2 TESTING-PIN + TR-9) in the test tier only, with production code byte-identical to HEAD. Without it the suite's central FR-2 claim rests on an assertion that cannot fail.",
      "Treat VAL-3 (the TS-20 db-tier run from the MAIN checkout post-merge) as a tracked completion obligation rather than a nice-to-have. It is the ONLY tier that can prove the on-demand slot satisfies window_slot NOT NULL and participates in the partial unique index, and TR-10 explicitly anticipates it being skipped with a misleading exit-0.",
      "Leave VAL-2 as a documented residual. Adding a source-text assertion to satisfy it would trade a real absence for a fake presence, which is worse than the honest gap.",
      "Carry SEC-3 (the pre-existing check-then-act cap TOCTOU, measured by the EXEC SECURITY review as not widened by this SD) forward as its own scoped item if it is ever to be fixed -- it needs a DB constraint or advisory lock, not a change to this verb.",
    ],
    detailed_analysis: {
      fr_verification: {
        FR_1_on_demand_and_guard_order: "PASS. --now is a boolean flag (`const isOnDemand = Boolean(a.now)`, :196) that bypasses ONLY the fixed-window check: the inert return for a non---now out-of-window fire is preserved verbatim at :199-202, satisfying TR-6. GUARD ORDER TRACED LINE BY LINE against the TESTING-PIN and it matches exactly: quiet-hours :220-248 -> dry-run return :250-253 -> enable/disable read :257 -> cap read :275 -> dedup :287 -> pin read :296 -> identity :311 -> staged-ledger write :325. `isOnDemand` appears in exactly two places in the whole file (:199 and :220), both strictly upstream of every guard, so there is no duplicated on-demand guard implementation that could drift. TS-15 is a genuine ordering proof, not a happy path -- it makes every later guard fail simultaneously (enabled:false, four cap-filling rows, a non-matching pin, resolveIdentity->null) and still requires refusal QUIET_HOURS with EXACTLY ONE ledger write, so a guard placed after the staged row could not pass it. --reason GENUINELY never persisted: `a.reason` is referenced nowhere; the only two `.reason` reads in the file are pinRead.rows[0].reason (:302, the pin's reuse of that column) and sendResult.reason (:353, the provider's own field). TS-18a asserts identical ledger key sets with and without --reason and that the literal reason text appears in no persisted row.",
        FR_2_finished_at_race: "PASS after the VAL-1 test fix. The select list at :153 DOES include `attempt`. Selection is genuine plain JS over an UNFILTERED read (TR-7/TR-8 honoured): `.filter(r => typeof r.finished_at === 'string' && r.finished_at)` at :161, then an explicit max-by-attempt loop at :165-168 -- no .not()/.order()/.limit() anywhere in the read, so the unit tier can actually observe the logic. MUTATION-VERIFIED on three axes, all KILLED: dropping the finished_at filter (reverting the race fix) -> 1 failed; first-wins instead of max-by-attempt -> 1 failed; min-by-attempt (> flipped to <) -> 1 failed. The fourth axis (dropping `attempt` from the select) SURVIVED and is VAL-1, now fixed and re-measured as killed.",
        FR_3_missing_feeder_named: "PASS. summarizeCounts' else branch at :107-110 pushes the feeder name plus 'no run yet today' rather than `continue`-ing, so a feeder with no finished row is named. Covered by TS-2 (one missing of three, asserts the named string) and by two of the four UPDATED pre-existing tests, which now assert all three feeders are named by exact string.",
        FR_4_plain_et_and_60min_threshold: "PASS. The threshold is the EXACT 60 minutes the TESTING-PIN demands, not 'any difference': MULTI_TIME_DISCLOSURE_THRESHOLD_MS = 60 * 60 * 1000 (:133) with a strictly-greater comparison at :141 ('exceeds 60 minutes'). It is computed over asOfAll, which is populated ONLY inside the hasCount branch (:106), exactly matching the AC's 'feeders that CONTRIBUTED A COUNT'. TS-4 asserts BOTH sides (45-minute spread does NOT disclose; 90-minute spread DOES), so an unconditionally-disclosing implementation fails -- mutation-verified: threshold -> 0 is KILLED. NO RAW ISO-8601 CAN REACH A BODY: the only timestamp path is formatEtTime(asOf) (:119-128, Intl.DateTimeFormat with timeZone America/New_York), and a null/unparseable result falls to the literal 'as-of unavailable' (:138); the summary half carries only frozen feeder names, counts behind a typeof==='number' guard (:103) and fixed labels. A dedicated test asserts the body does not match an ISO-8601 date-time regex and does match a plain-ET regex.",
        FR_5_quiet_hours_guard: "PASS. Composition is correct and is the one the TESTING-PIN demands: resolveQuietHoursContext (imported :77, bound as the default of the injectable `resolveQuietHours` dep at :180) supplying { allowQuietHours, chairmanZone }, composed with isSmsQuietHour (imported :76) as the in-window predicate -- NOT resolveAllowQuietHours alone, which cannot supply chairmanZone. INDEPENDENTLY VERIFIED THE PRODUCTION CALL SIGNATURE, which no test can reach because all 18 usages inject a double: lib/comms/adam-outbound/quiet-hours-extension.js:130 declares `export async function resolveQuietHoursContext(now, opts = {})`, and checkpoint-send.mjs:223 calls `resolveQuietHours(now)` -- positionally correct, so the production default is invoked properly and not silently returning defaults. Boundary is right: isSmsQuietHour is `hour >= 22 || hour < 6` (lib/time/chairman-et-wall-clock.js:138-141), so hour===6 is NOT quiet; TS-10 pins it. Scoped to the on-demand path only, so the fixed-window path is untouched (FR-5 AC4), and TS-11 spot-checks that. TR-11 honoured: the QUIET_HOURS row is outcome='refused' (:243), which the cap filter at :281 does not count, so quiet-hours refusals do not burn cap budget -- TS-16 asserts it.",
      },
      security_findings_reverification: {
        SEC_1_strict_not_truthy: "GENUINELY FIXED IN SHIPPED CODE, not just claimed. checkpoint-send.mjs:226 reads `isQuiet = allowQuietHours !== true && isSmsQuietHour(now, chairmanZone)` -- strict === true, matching this file's own convention at the enable/disable guard (:264 `enabledRow.enabled !== true`). Confirmed present in the HEAD diff (commit 11316f20a78) AND mutation-verified: reverting to the truthy form `!allowQuietHours` causes the dedicated SEC-1 test (which injects allowQuietHours:'false', the truthy string) to FAIL. Note the short-circuit is also correct -- when a genuine override is active, isSmsQuietHour is never evaluated, so a garbage zone accompanying a valid override cannot throw.",
        SEC_2_malformed_zone_caught: "GENUINELY FIXED IN SHIPPED CODE. The isSmsQuietHour(now, chairmanZone) call is now INSIDE the try (:222-226), so a null or non-canonical zone that makes Intl throw a RangeError is caught at :227 rather than propagating out of a function documented as 'Never throws'. The catch falls back to `isSmsQuietHour(now)` (:234) passing NO zone argument -- which is the correct construction, because isSmsQuietHour's default is a DEFAULT PARAMETER (`zone = TZ`) and default parameters engage on `undefined` only, NOT on `null`; passing a caller-influenced `chairmanZone` that happened to be null would have re-thrown. Mutation-verified: reverting to the pre-fix shape (catch covering only the resolver, evaluation outside) fails the dedicated SEC-2 test (injected chairmanZone 'Not/A_Real_Zone'). Residual noted and accepted: the catch's own isSmsQuietHour(now) is not itself wrapped, but it uses the module-constant zone and cannot throw.",
        fail_closed_direction: "Re-confirmed the catch is fail-CLOSED, not permissive: it sets isQuiet from the module-default ET zone rather than defaulting to 'not quiet'. FR-5's last TESTING-PIN says checkpoint-send.mjs 'must NOT wrap the call in its own try/catch that substitutes a permissive default' -- the shipped code DOES add its own try/catch, but the operative prohibition is on a PERMISSIVE default, and this one is strictly more conservative than the resolver's own internal catch. SEC-2 in fact REQUIRED the try to be widened. Compliant with the AC as written; TS-17 (throwing resolver -> QUIET_HOURS) proves it.",
      },
      tr4_null_window_slot: "CLOSED IN SHIPPED CODE, not merely documented. windowIdFor returns null off-window (:197), which is the defining condition of the on-demand path, and michael_checkpoint_send_ledger.window_slot is TEXT NOT NULL. There are exactly two continuations from a null slot and neither can reach an insert with null: the non---now branch returns the inert result at :199-202 BEFORE any write, and the --now branch unconditionally reassigns windowSlot to the per-minute stamp on-demand:HH:MM at :210-212. Every subsequent insert (:242 quiet-hours, :260 held, :265 disabled, :278/:283/:288 refusals, :299/:306/:313 refusals, :325 staged) therefore sees a non-null string. TS-12 asserts the literal on-demand:HH:MM shape and explicitly asserts not-null and not the bare 'on-demand' constant, which is the only unit-tier protection available (the fake does not model NOT NULL). TR-5's per-minute rationale also holds: TS-14 proves both limbs -- a different ET minute does NOT dedup (so the on-demand ceiling is 4/day, not 1/day) while the SAME ET minute DOES dedup (so the crash/double-fire case the dedup exists for is preserved). Theoretical residual, not production-reachable and not chargeable: if etMinuteOfDay(now) ever yielded NaN the stamp would be the string 'on-demand:NaN:NaN' -- still non-null, so still no NOT NULL violation; `now` is always new Date() in main().",
      preexisting_test_regression_audit: "NO WEAKENING FOUND. git diff origin/main...HEAD on the test file is 379 insertions / 8 deletions, and the 8 deletions are 4 assertions in 4 pre-existing tests, EVERY one of which was replaced by an equal-or-stronger assertion on the NEW correct behavior: (1) 'feeder whose counts object lacks the named key' went from a single toBe('no counts available') -- which had PINNED the FR-3 silent-drop bug -- to three toContain assertions naming all three feeders (STRONGER). (2) 'no rows at all' went from toEqual({summary,asOf}) to an exact full-summary string plus asOf null plus asOfAll [] (STRONGER; it also newly pins the asOfAll field FR-4 depends on). (3) composeCheckpointBody's template test went from an exact raw-ISO string -- which had PINNED the FR-4 raw-ISO bug -- to an exact plain-ET string 'as of 12:00am ET', and RETAINED the 'as-of unavailable' limb unchanged (equal strength, correct new behavior). (4) the TS-9 send-body assertion went from toContain('as of 2026-09-14T09:00:00.000Z') to toContain('as of 5:00am ET'); I verified the conversion independently -- 09:00Z on 2026-09-14 is 05:00 EDT (UTC-4) -- so it is a correct value, not a loosened one. No assertion was deleted without replacement, none was softened to a truthiness or existence check, and three entirely new FR-4 tests were added alongside (no-raw-ISO regex, 45-minute non-disclosure, 90-minute disclosure).",
      what_prior_reviews_missed: [
        "VAL-1, the TR-9 select-list gap. The EXEC-TO-PLAN SECURITY evidence row asserted 'TS-1 ... Must additionally assert the read selected attempt' as satisfied, and the test's own comment claims it verifies TR-9 -- but the assertion underneath checks only that a read occurred against the table. Neither prior review mutation-tested the select list, which is the only way to see it. This is the precise failure mode TR-9 was written to prevent, so it is notable that it shipped anyway.",
        "The production call signature of the default quiet-hours resolver. All 55 tests inject a double for resolveQuietHours, so a signature mismatch between checkpoint-send.mjs's `resolveQuietHours(now)` and the real resolveQuietHoursContext would be completely invisible at the unit tier and would silently degrade production to default values. Neither prior review checked it. I did: lib/comms/adam-outbound/quiet-hours-extension.js:130 is `(now, opts = {})` -- positionally correct.",
        "VAL-2, that FR-5's AC7 ('a test must assert the production default is the real resolver') has no corresponding test at all. The EXEC TESTING review counted TS-9/TS-15/TS-17 as covering FR-5 but none of them exercises the default binding.",
        "VAL-4, the FR-1 AC5 vs guard-order TESTING-PIN tension for a --now dry-run inside quiet hours. Undocumented anywhere before this review.",
      ],
      commands_run: [
        'Read the live PRD from product_requirements_v2 at run time (joined via strategic_directives_v2.sd_key -> sd_id; NOTE product_requirements_v2 has NO sd_key column) -> FR-1..FR-5 with all TESTING-PINs, TS-1..TS-20, TR-1..TR-11',
        'cat -n scripts/michael/checkpoint-send.mjs (full 384 lines, read end to end -- no prior summary trusted)',
        'npx vitest run scripts/michael/checkpoint-send.test.js -> Tests 55 passed (55) -- CONFIRMS the claimed 55',
        'npx vitest run scripts/michael/ -> 21 files, 548 passed (548) -- confirms the VAL-1 test-harness change regresses nothing else',
        'git show 11316f20a78 -- scripts/michael/checkpoint-send.mjs -> SEC-1/SEC-2 fixes verified present in the shipped diff, not just in the commit message',
        'git diff origin/main...HEAD -U6 -- scripts/michael/checkpoint-send.test.js -> 379 insertions / 8 deletions; all 4 changed pre-existing assertions audited individually',
        'MUTATION M1 select-list drop `attempt` -> SURVIVED 55/55 (VAL-1); after fix -> KILLED (1 failed | 54 passed)',
        'MUTATION M2 first-wins instead of max-by-attempt -> KILLED (1 failed)',
        'MUTATION M3 min-by-attempt (> flipped to <) -> KILLED (1 failed)',
        'MUTATION M4 drop the finished_at filter (revert the race fix) -> KILLED (1 failed)',
        'MUTATION M5 disclosure threshold 60min -> 0 -> KILLED (1 failed)',
        'MUTATION M6 quiet-hours strict `!== true` -> truthy `!allowQuietHours` (SEC-1 revert) -> KILLED',
        'MUTATION M7 SEC-1+SEC-2 both reverted (catch covering only the resolver, evaluation outside the try) -> KILLED (2 failed: the SEC-1 and SEC-2 tests)',
        'md5sum verified after EVERY mutation: scripts/michael/checkpoint-send.mjs restored to e688d3029cdfdfec90ec6e2e6c7ea5c4, byte-identical to HEAD -- production module NOT modified by this review',
        'grep for `a.reason` / `.reason` in checkpoint-send.mjs -> only pinRead.rows[0].reason (:302) and sendResult.reason (:353); --reason genuinely never read, never persisted',
        'Read lib/comms/adam-outbound/quiet-hours-extension.js:130 and lib/time/chairman-et-wall-clock.js:138-141 -> resolver signature and quiet-window predicate verified independently',
        'awk scan for on-demand tests omitting the resolveQuietHours injection -> only TS-11 and TS-19, neither of which reaches the resolver (VAL-2)',
      ],
      files_reviewed: [
        'scripts/michael/checkpoint-send.mjs (full, 384 lines, unmodified by this review)',
        'scripts/michael/checkpoint-send.test.js (full; MODIFIED by this review -- VAL-1 fix only)',
        'lib/michael/db.mjs (readRows/writeRows/parseArgs -- confirmed readRows issues .select(select).limit(500), so the select IS a recordable builder op)',
        'lib/time/chairman-et-wall-clock.js (isSmsQuietHour, default parameter zone = TZ, SMS quiet constants)',
        'lib/comms/adam-outbound/quiet-hours-extension.js (resolveQuietHoursContext signature and fail-safe contract)',
        'product_requirements_v2 live row PRD-SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 (functional_requirements, test_scenarios, technical_requirements)',
        'scripts/one-off/michael-texting-exec-to-plan-security-evidence.mjs (prior EXEC-phase SECURITY evidence, cross-checked)',
      ],
      changes_made_by_this_review: {
        production_code: 'NONE. scripts/michael/checkpoint-send.mjs is byte-identical to HEAD (md5 e688d3029cdfdfec90ec6e2e6c7ea5c4), verified after every mutation.',
        test_code: "scripts/michael/checkpoint-send.test.js ONLY, two edits closing VAL-1: (a) fakeSb now retains each READ's recorded ops in a `reads` array (the write branch already retained them; TR-7 requires ops inspection for query-level assertions but reads were discarding them), and (b) TS-1's vacuous TR-9 assertion was replaced with one that reads the recorded select argument and asserts it contains 'attempt', with the misleading comment corrected.",
      },
    },
    metadata: {
      independent_verification: true,
      verified_by_mutation_testing: true,
      mutations_run: 7,
      mutations_survived_before_fix: 1,
      mutations_survived_after_fix: 0,
      production_code_modified: false,
      test_suite_pass_count: 55,
      michael_suite_pass_count: 548,
      frs_verified: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5'],
      security_findings_reverified: ['SEC-1', 'SEC-2'],
      findings: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 3 },
      gaps_found_and_fixed: 1,
      residuals_carried_to_lead: ['VAL-2', 'VAL-3'],
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/michael-texting-verify-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Principal Systems Analyst' }, results, { sdKey: SD_KEY, phase: 'VERIFY' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
