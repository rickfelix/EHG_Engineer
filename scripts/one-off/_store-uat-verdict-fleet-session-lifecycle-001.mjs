#!/usr/bin/env node
/**
 * Persist the UAT sub-agent's EXEC-TO-PLAN pre-handoff acceptance review for
 * SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 (commit 62aaaa26bfc, PR #7339).
 *
 * Methodology: queried the live PRD's functional_requirements.acceptance_criteria for all 4 FRs,
 * then verified each criterion against the actual shipped code/tests/DB/host state directly --
 * including running the full claimed test suite myself, running 3 independent live mutation tests
 * (reverting fleet-actions.js, graceful-kill.mjs+fleet-kill.mjs, and injecting a new resume_uuid
 * aliased-read violation), querying claude_sessions for the FR-4 staleness re-measurement, checking
 * the shared-root .env directly, and querying live Windows Task Scheduler state + IsInRole(Administrator)
 * for FR-2's blocked-registration claim.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001';
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, target_application').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr || !sd) { console.error('SD lookup failed', sdErr); process.exit(1); }

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  status: 'completed',
  summary: 'Per-criterion UAT review of all 4 FRs against live code/tests/DB/host state, immediately before EXEC-TO-PLAN. FR-1 (7/7 AC met, live mutation-verified by re-reverting fleet-actions.js myself), FR-3 (7/8 AC met with a live safety-critical mutation test -- reverted graceful-kill.mjs+fleet-kill.mjs and confirmed the PRE-FIX code would have KILLED a protected-branch session with genuinely uncommitted work; 1 AC only cosmetically unmet: buildKillDeps never adds an explicit env key, though gracefulKillSession\'s own default parameter makes this functionally inert), and FR-4 (4/5 AC met, including a live-injected new violation file that the widened guard correctly caught) are all solid. FR-2\'s two deferred sub-scopes (creation-time parentage, scheduled-task registration) are HONESTLY represented -- PRD text says DEFERRED/BLOCKED explicitly, cites a real escalation SD (verified to exist: SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001) and a real coordinator signal (verified to exist: 6a127ed4). One accuracy issue found in FR-2\'s supporting evidence: the "no sibling watcher task is registered on this host either" control-check claim is FALSE as stated -- live schtasks query shows 2-3 of the cited sibling tasks ARE registered and Ready (running as the current user, not SYSTEM); the underlying BLOCKED conclusion is still correct (independently verified via IsInRole(Administrator)=False and the console-reaper validator\'s hard SYSTEM/service-account-only gate) but for a different, script-specific reason than the stated "fleet-wide" framing implies. The one genuine NOT-MET finding: FR-4 AC-3 ("the 3 other cannot-fail tests named in QF-20260728-682/005") was never addressed -- a PLAN-phase critique explicitly flagged this exact acceptance criterion as unidentified/undefined scope with a suggested fix (name the 3 tests in the PRD), and that fix was never applied; the current PRD text is unchanged and still does not name them; no code, test, or DB record anywhere in this SD\'s evidence trail dispositions the other 2 of the 3 (the FR-5(old)/console-reaper "ignored-keys" test and the FR-4(old) UI-lock test) -- unlike FR-2\'s deferrals, this is a silent gap, not an honestly-flagged one. Recommend PLAN require an explicit disposition (fix or documented defer, matching FR-2\'s own standard) for FR-4 AC-3 before LEAD-FINAL-APPROVAL; recommend correcting FR-2\'s sibling-task claim for evidence accuracy. Neither blocks EXEC-TO-PLAN outright given the safety-critical fix (FR-3) is solid and verified, and PR #7339 CI is green (45/45) with the exact claimed test numbers (252 files, 3176 passed, 1 skipped, 0 failures) reproduced independently.',
  findings: [
    {
      id: 'UAT-FR1-ALL-MET',
      severity: 'INFO',
      title: 'FR-1: all 7 acceptance criteria MET, live-verified',
      detail: 'AC-1: server/routes/fleet-actions.js addSession forwards uiLabel/uiEnabled/holderIsFresh on BOTH the 400-refusal and 200-success response bodies (code read directly). AC-2: live-reverted fleet-actions.js to its pre-fix parent commit and re-ran tests/unit/fleet/addsession-singleton-refusal.test.js myself -- 3 tests genuinely failed (defaultResolveHolderId undefined / uiLabel wrong), restored and reconfirmed 9/9 green -- this is a REAL discriminating mutation test, not a trusted claim. AC-3: server/public/fleet-ui/fleet-panel-add-session-uilabel.test.js is a jsdom rendering test against the REAL fleet-panel.js module (not a mock), with a documented rationale for why a literal screenshot is impractical (window.prompt() blocks browser automation) -- a fair "equivalent capture" reading. AC-4: singleton-spawn-decision.mjs\'s header comment corrected in the diff, confirmed by direct read. AC-5: fleet-panel.js\'s wireAction() now renders payload.uiLabel verbatim via a describeResult callback, no client-side decision logic; fleet-panel-no-ui-only-gate.test.js re-run by me, 5/5 still pass unchanged. AC-6: lib/coordinator/adam-identity.cjs / solomon-identity.cjs are NOT in this commit\'s diff at all (confirmed via git show --stat) -- getActiveAdamId/getActiveSolomonId are structurally guaranteed unchanged; a regression test cross-checks the same stale row against both resolvers. AC-7: addsession-singleton-refusal.test.js\'s honoringSb double genuinely honors .gte()/.filter(), confirmed by reading fetchAllAdamsStrict (no .gte at all) vs fetchFreshAdams (.gte present) in adam-identity.cjs directly.',
    },
    {
      id: 'UAT-FR3-SAFETY-CRITICAL-VERIFIED-LIVE',
      severity: 'INFO',
      title: 'FR-3: the safety-critical fix is real -- I independently reproduced the pre-fix data-loss bug and confirmed the fix closes it',
      detail: 'Live-reverted BOTH lib/fleet/graceful-kill.mjs and scripts/fleet-kill.mjs to their pre-fix parent-commit versions and re-ran lib/fleet/graceful-kill.test.js myself: 5 tests failed, most importantly "FR-3 REAL WIRE: protected branch + genuinely dirty tree, real collaborators end to end" -- against pre-fix code, a session on a protected branch (main) with genuinely uncommitted work returns outcome:"killed" (i.e. the pre-fix code WOULD HAVE DESTROYED the work); against the shipped fix, the same real-git-fixture scenario returns "halted". Restored both files, reconfirmed 52/52 green (graceful-kill.test.js + fleet-kill-cli.test.js). The NULL worktree_path regression fix (9/11 live sessions today, confirmed via the code\'s own hasWorktree short-circuit at graceful-kill.mjs:201-212) is also real and tested with both a hand-fixture and a REAL-WIRE test using the actual runPreparkWip+isWorktreeDirty implementations composed together. isWorktreeDirty (scripts/fleet-kill.mjs) is genuinely synchronous (execSync, not async) and fails closed on null/empty/undefined/unresolvable paths -- verified against real throwaway git fixtures in tests/unit/fleet/fleet-kill-cli.test.js, re-run by me (52/52 pass). AC-3 (no fixture hardcodes isWorktreeDirty to one constant) -- the base deps() fixture in graceful-kill.test.js still defaults isWorktreeDirty to true, but multiple new test cases explicitly override it to false and to the real implementation; "no longer hardcoded across ALL cases" reads as satisfied. AC-5 (no scope creep into decidePrepark/prepark-wip.cjs) -- confirmed zero diff to lib/fleet/prepark-wip.cjs and tests/unit/fleet-auto-push-wip.test.js; re-ran that file myself, 17/17 pass, matching the PR\'s claim.',
    },
    {
      id: 'UAT-FR3-AC4-ENV-KEY-COSMETIC-GAP',
      severity: 'LOW',
      title: 'FR-3 AC-4 (env key): NOT literally met, but functionally inert -- worth a follow-up, not a blocker',
      detail: 'AC-4 reads: "buildKillDeps also supplies env (safe default) and recordStop is either included in buildKillDeps\'s own returned deps object or the gap is explicitly documented...". Confirmed via git diff that scripts/fleet-kill.mjs\'s buildKillDeps() never adds an env key to its returned object (zero occurrences of "env" in the diff), and no test asserts deps.env is present. This is functionally harmless: gracefulKillSession destructures `env = process.env` as its own default parameter, so omitting the key from deps produces IDENTICAL runtime behavior to explicitly setting env: process.env. The recordStop half is arguably satisfied by a PRE-EXISTING (not added by this PR) comment block at the out-of-band attachment site in main() explaining recordStop\'s CAS-guard/opts.gone-forwarding rationale -- but that comment does not explicitly flag "a future caller of buildKillDeps alone will silently skip this step," which is the specific risk AC-4 names. Recommend a trivial follow-up: add env: process.env to buildKillDeps\'s returned object for literal AC compliance; no functional urgency.',
    },
    {
      id: 'UAT-FR4-AC1-AC2-AC4-AC5-MET',
      severity: 'INFO',
      title: 'FR-4: 4 of 5 acceptance criteria MET, including a live-injected mutation test',
      detail: 'AC-1: lib/fleet/resume-context.test.js widens detection to catch an ALIASED local-variable read (findResumeUuidReadMatches/detectsResumeUuidRead) AND allowlists the one legitimate case (session-registry-adapter.js, alias "meta") with a full inline rationale (computeLiveSlotDrift feed, 8/13,110 rows). AC-2: I personally wrote a NEW throwaway file (lib/fleet/zzz-mutation-probe-fr4.js) containing the exact aliased-read shape (an alias of the session\\'s metadata object, then a property access for the resume UUID field on that alias) OUTSIDE the allowlist, re-ran the suite, and watched the repo-wide walk test genuinely fail and name the new offender file -- then deleted the probe and reconfirmed 22/22 green. This is real, live proof the guard discriminates a NEW violation, not a trusted claim. AC-4: independently queried claude_sessions directly (not trusting the code comment) -- 13,110 total rows, exactly 8 with the resume UUID metadata field set, an EXACT match to the "8/13,110" figure the shipped comments cite as "re-measured 2026-08-21." AC-5: negative-control tests exist and pass (alias of a different field, alias of an unrelated fleet_desired_slots-shaped object, and a write-not-read case), confirmed in the 22/22 run.',
    },
    {
      id: 'UAT-FR4-AC3-NOT-MET',
      severity: 'MEDIUM',
      title: 'FR-4 AC-3 NOT MET: "the 3 other cannot-fail tests" were never named, fixed, or dispositioned -- a previously-flagged gap that was never closed',
      detail: 'AC-3 text: "The 3 other \'cannot-fail\' tests named in the original QF-20260728-682/005 signal are re-examined and tightened or explicitly dispositioned (fixed, or documented as intentionally permissive with rationale)." Traced the source: feedback rows quick_fix_id=QF-20260728-682 and QF-20260728-005 (both dated 2026-07-28, both status=resolved) name three cannot-fail tests from the PREDECESSOR SD (SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001, different FR numbering): (1) the old FR-3/AC-4 module-scoped resume_uuid test -- this is the one THIS SD\'s FR-4 already targets as its headline fix (repo-wide widening + alias detection), reasonably treated as covered; (2) "FR-5 AC-4 ignored-keys" (a console-reaper exclusion-list test that greps only 4 of 5 named exclusions); (3) "the FR-4 UI lock" (a source-text grep a setAttribute-disabled/class-toggle gate would slip past). Searched the ENTIRE shipped diff, the full current PRD row (all fields), every sub_agent_execution_results row for this SD, and all 4 plan_critiques rows: zero mentions of "ignored-keys" or "FR-5" anywhere, and the ONLY match for "3 other"/"cannot-fail" is a PLAN-phase critique (plan_critiques id 028019b8, severity "warn", category "missing_criteria") that explicitly says: "those tests are not identified anywhere in this PRD. That leaves a required scope item undefined," with a suggested fix to "Name the three tests explicitly in the PRD/plan... so the work can be completed and reviewed deterministically." That suggested fix was never applied -- confirmed the CURRENT PRD\'s FR-4 AC-3 text is still exactly as vague as when the critique was written. Unlike FR-2\'s deferrals (which explicitly say DEFERRED/BLOCKED inline with rationale and a named escalation SD), this AC is simply SILENT in every piece of evidence this SD produced -- neither fixed nor explicitly dispositioned, despite the AC\'s own text offering both as acceptable outcomes.',
    },
    {
      id: 'UAT-FR2-DEFERRALS-HONEST',
      severity: 'INFO',
      title: 'FR-2: both deferred sub-scopes are honestly represented, with real, verifiable escalation evidence',
      detail: 'Verified FLEET_CONSOLE_REAPER_ENABLED=on is genuinely set in the SHARED ROOT .env (C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.env, read directly, NOT the worktree copy), with a dated comment recording the 2026-07-27 chairman-authorization provenance and referencing this SD by key; confirmed .env is gitignored (not a committed secret). Verified SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 genuinely exists in strategic_directives_v2 (status pending_approval, created 2026-08-21T11:50:11, 9 minutes after the WORKER_SIGNAL:PRD-AMBIGUOUS signal explaining why creation-time capture was escalated rather than force-completed). Verified coordinator signal 6a127ed4-8845-4047-bcbf-161668295bea genuinely exists in session_coordination with a WORKER_SIGNAL:STUCK subject matching the PRD\'s cited disposition. Verified console-reaper-task-registration.test.js\'s new buildQueryArgs/buildRemoveArgs tests (13/13 file total) pass, matching AC-5\'s "rollback argv-construction half" claim. Verified console-reaper.test.js + run-console-reaper.test.js (28/28, pre-existing, unmodified by this PR) both pass, matching AC-6\'s "enable-flag/unregister-inertness half already covered" claim. This is materially the RIGHT way to handle an environmentally-blocked sub-scope -- explicit BLOCKED/DEFERRED language inline in the PRD, a real signal, a real escalation SD, and no attempt to claim completion.',
    },
    {
      id: 'UAT-FR2-SIBLING-TASK-CLAIM-INACCURATE',
      severity: 'MEDIUM',
      title: 'FR-2: the "no sibling watcher task is registered on this host either" control-check is FALSE as stated -- the BLOCKED conclusion still holds, but for a different, narrower reason',
      detail: 'The PRD/signal text (session_coordination id 6a127ed4) states: "CONTROL CHECK: none of the 3 sibling tasks (LEO-RebootRespawn, LEO-LivenessWatcher, LEO-EvaWatcher) are registered on this host either -- so this is not a console-reaper-specific regression, it\'s this session\'s whole execution context lacking admin rights fleet-wide." Live-queried Windows Task Scheduler myself (schtasks /Query, PowerShell) on this exact host: "EHG EVA Scheduler Watcher" and "EHG LEO Liveness Watcher (PID classes)" ARE registered and Ready (next-run times populated), running as user "rickf" -- not SYSTEM. Only "EHG Fleet Reboot-Respawn" is genuinely absent, matching 1 of the 3 cited names. So the "none of the 3 sibling tasks are registered" claim is factually wrong for 2 of 3. Read scripts/setup-eva-watcher-task.mjs\'s own header (QF-20260726-677): registering with /RU <current-user> /NP (S4U, non-interactive, session-0, no window) "normally needs no elevation to register" -- exactly how the 2 live siblings got registered without an elevated session. scripts/setup-console-reaper-task.mjs, by contrast, defaults runAs to SYSTEM, and lib/fleet/console-parentage.mjs\'s validateScheduledTaskPrincipal only accepts logonType serviceaccount/s4u or a userId containing "system"/"service" -- principalSpecFor() never tags a plain named user as s4u, so it is REJECTED outright ("not a recognised session-0 logon type") rather than merely requiring elevation. Net effect: the underlying BLOCKED-without-Administrator conclusion for THIS SPECIFIC script\'s SYSTEM-only registration path is independently confirmed true (verified via PowerShell IsInRole(Administrator)=False on this exact session, and via reading the validator\'s hard gate) -- but the stated corroborating evidence ("fleet-wide" / "none of the siblings") overstates the scope of the constraint and is not accurate as written. Recommend correcting this specific claim in the PRD/signal text; does not change the BLOCKED disposition itself.',
    },
    {
      id: 'UAT-DRY-RUN-PATH-VERIFIED-CORRECT-FROM-SHARED-ROOT',
      severity: 'INFO',
      title: 'FR-2 AC-1 dry-run path claim: confirmed correct, but only when run from the shared root (not any worktree) -- exactly as the PRD instructs',
      detail: 'Ran `node scripts/setup-console-reaper-task.mjs --dry-run` myself from two locations. From this EXEC worktree, the runner path in the emitted schtasks command resolves to the WORKTREE\'s own scripts/run-console-reaper.mjs (a path that would go stale once the worktree is cleaned up post-merge). From the actual shared root (C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer, on main), the same dry-run correctly resolves to the persistent shared-root path. Because the script resolves paths via import.meta.url (the physical location of the invoked file), NOT cwd, this is expected and by design -- the PRD\'s own remaining-work instruction already says the privileged actor must run it "from an elevated prompt at the shared root," which is the only context that produces the correct path. AC-1\'s "verified correct (points at the persistent shared-root path)" claim is accurate for that intended invocation context.',
    },
    {
      id: 'UAT-TESTPLAN-REPRODUCED',
      severity: 'INFO',
      title: 'PR #7339 Test plan checklist reproduced exactly; CI independently confirmed green',
      detail: 'Ran the exact command from the PR description myself: npx vitest run lib/fleet/ tests/unit/fleet/ tests/unit/server/fleet-actions-route.test.js server/public/fleet-ui/ tests/unit/coordinator/ -> 252 files, 3176 passed, 1 skipped, 0 failures -- an EXACT match to the PR\'s claimed numbers. gh pr checks 7339: 45 checks report "pass", 1 ("Agentic Review") reports "skipping" (not a failure) -- matches "45/45 CI checks passing." No uncommitted tracked-file changes exist in the worktree (git status --porcelain, tracked files only, returns empty) -- the committed diff I reviewed is the true current state of every file this SD touches.',
    },
  ],
  critical_issues: [],
  warnings: [
    {
      issue: 'FR-4 AC-3 ("the 3 other cannot-fail tests") is unaddressed and undocumented -- a PLAN-phase critique already flagged this exact gap and its suggested fix (name the tests in the PRD) was never applied.',
      severity: 'MEDIUM',
      recommendation: 'Before LEAD-FINAL-APPROVAL, either (a) fix/tighten the 2 remaining named tests (console-reaper "ignored-keys" exclusion test, and the UI-lock source-text-grep test) as a fast-follow, or (b) explicitly disposition them in the PRD with the same rigor FR-2 used for its own deferrals (name them, cite rationale, link a tracking SD/QF if deferring). Silence is not an acceptable third option given the AC\'s own text.',
    },
    {
      issue: 'FR-2\'s "no sibling watcher task is registered on this host either" control-check claim is factually inaccurate (2 of 3 cited siblings ARE registered, running as the current user rather than SYSTEM).',
      severity: 'LOW',
      recommendation: 'Correct the claim in the PRD/signal text for evidence accuracy. Does not change the BLOCKED disposition, which is independently confirmed true for the SYSTEM-only registration path this script requires.',
    },
    {
      issue: 'FR-3 AC-4\'s "buildKillDeps also supplies env (safe default)" sub-clause is not literally implemented (no env key added), though functionally inert since gracefulKillSession\'s own default parameter already covers it.',
      severity: 'LOW',
      recommendation: 'Trivial follow-up: add env: process.env to buildKillDeps\'s returned object for literal AC compliance. No functional urgency.',
    },
  ],
  recommendations: [
    'CONDITIONAL PROCEED to EXEC-TO-PLAN: the safety-critical FR-3 fix is solid and independently verified live; FR-1 and the bulk of FR-4 are solid; FR-2\'s deferrals are honestly disclosed with real escalation evidence.',
    'PLAN should require an explicit disposition of FR-4 AC-3 (the 2 still-unaddressed "cannot-fail" tests) before LEAD-FINAL-APPROVAL -- either fixed or formally deferred with the same rigor as FR-2.',
    'Low-priority cleanup: correct FR-2\'s sibling-task claim; add env: process.env to buildKillDeps.',
  ],
  detailed_analysis: 'Per-criterion UAT pass immediately before EXEC-TO-PLAN handoff for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 (id 1eadc0ce-2dd4-4841-b09c-cbd5f08c52b0, commit 62aaaa26bfc, PR #7339). Queried the live PRD directly, then verified every acceptance_criteria line per FR against actual shipped code, by (1) reading every diffed file directly rather than trusting the commit message, (2) running the exact test commands the PR claims, (3) running 3 independent LIVE mutation tests of my own (temporarily reverting fleet-actions.js for FR-1, graceful-kill.mjs+fleet-kill.mjs for FR-3, and injecting a brand-new resume_uuid aliased-read violation file for FR-4 -- confirming red, then restoring and reconfirming green each time, with zero net diff left in the tree), (4) querying claude_sessions directly for FR-4\'s re-measured staleness figure, (5) reading the shared-root .env directly for FR-2, (6) querying live Windows Task Scheduler state and IsInRole(Administrator) directly for FR-2\'s BLOCKED claim, and (7) tracing the "3 other cannot-fail tests" reference in FR-4 AC-3 back through feedback/quick-fix rows, plan_critiques, and every sub_agent_execution_results row for this SD to confirm it was never actually named or dispositioned anywhere.',
  metadata: {
    phase: 'EXEC',
    sd_key: SD_KEY,
    gate: 'EXEC-TO-PLAN pre-handoff validation (UAT / operator acceptance)',
    pr_number: 7339,
    commit: '62aaaa26bfc2560a7faa52dcb061f1996d3a7edd',
    metrics: {
      frs_reviewed: 4,
      total_acceptance_criteria: 27,
      met: 22,
      deferred_with_rationale: 4,
      not_met: 1,
      live_mutation_tests_run_by_uat_agent: 3,
      tests_passed_reproduced: 3176,
      tests_skipped_reproduced: 1,
      test_files_passed_reproduced: 252,
      ci_checks_passed: 45,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application || 'EHG_Engineer',
  subAgentCode: 'UAT',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('UAT', sd.id, { name: 'UAT Test Executor' }, results, {
  phase: 'EXEC',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
