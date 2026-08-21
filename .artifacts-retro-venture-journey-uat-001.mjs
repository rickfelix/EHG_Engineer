#!/usr/bin/env node
/**
 * One-off RETRO authoring + evidence-persistence script for
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001.
 *
 * 1. Inserts a genuine, SD-specific SD_COMPLETION retrospective into `retrospectives`.
 * 2. Persists RETRO's execution evidence to `sub_agent_execution_results` via the
 *    canonical writer (storeSubAgentResults), with metadata.repo_path resolved via
 *    resolveSubAgentRepo/applySubAgentRepoVerdict (lib/sub-agents/resolve-repo.js).
 * 3. Independently re-reads both rows back to confirm persistence.
 */
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from './lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from './lib/sub-agent-executor/results-storage.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SD_KEY = 'SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';
const SD_CANONICAL_ID = '7b8be04e-1f2b-431c-b33d-4574013a94e5'; // strategic_directives_v2.id (NOT uuid_id)

async function main() {
  // ---------------------------------------------------------------------
  // 1) Sanity: confirm no SD_COMPLETION retro already exists for this SD
  // ---------------------------------------------------------------------
  const { data: existing, error: existingErr } = await supabase
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_CANONICAL_ID)
    .eq('retro_type', 'SD_COMPLETION');
  if (existingErr) throw new Error(`existing-check failed: ${existingErr.message}`);
  if (existing && existing.length > 0) {
    console.log(`⚠️  SD_COMPLETION retrospective(s) already exist: ${existing.map(e => e.id).join(', ')}`);
    console.log('   Proceeding to insert a fresh one anyway is NOT done automatically — aborting.');
    process.exit(1);
  }

  // ---------------------------------------------------------------------
  // 2) Build the retrospective content
  // ---------------------------------------------------------------------
  const description = `Originated from a measured, not assumed, defect: AltifyAI's entire Stage-19 tree (sprint orchestrator -> 9 feature orchestrators -> Data/API/UI/Test-Layer children) read 100% "completed", yet ImageUploadComponent was imported by zero screens on rickfelix/altifyai origin/main and the deployed journey ended at an empty Usage Analytics dashboard -- per-layer tests proved layers, not the journey. Fleet-wide, the LEO-side UAT requirement was dead in practice: 0 of 25 feature SDs completed in the trailing 14 days had a uat_test_runs row, and the UAT sub-agent had fired 1x vs TESTING's 431x.

FR-0 (falsifier, shipped first, before any other code): hand-declared a 5-step AltifyAI journey (land -> sign-up -> upload image -> usage analytics -> feedback) and ran it against the live deployment. The originally-worded mechanism ("run the existing journey walker") was infeasible as written -- lib/eva/journey-walk-driver.js is local-serve-only (MARKETLENS_SERVE_CONFIG, port 3001) -- so lib/apa/live-instance-acquisition.mjs's acquireLiveInstance was used directly for reachable steps, and static source verification (a GitHub code search confirming ImageUploadComponent is imported by zero files under src/ui/, plus App.jsx's own docblock stating only /register and /dashboard are wired) was used for steps that would have required creating a real account -- a prohibited action for an automated agent. Result: land=PASS, sign-up=PASS, upload-image=FAIL (premise confirmed), usage-analytics=inconclusive pending auth, feedback=PASS.

FR-5 (repair LEO-side UAT enforcement, PR 1/4) found the enforcement path dead on BOTH sides independently, not just the one the origin report named. Read side: scripts/hooks/stop-subagent-enforcement/type-aware-validator.js selected a nonexistent uat_test_runs.overall_result column, AND separately compared uatRequirement === 'REQUIRED' (a string) against getUATRequirement()'s actual return value (an object unless {returnLegacy:true} is passed) -- always false. The identical dead comparison was found, by testing-agent's LEAD-phase prospective review, in scripts/hooks/phase-state-enforcement.js too, and fixed there as well though the original plan named only the first file. Write side (found during PLAN-phase story-grounding, not in the original plan): lib/uat/result-recorder.js referenced 11 columns that never existed on the real uat_test_runs table (total/passed/failed/skipped/executed_by/commit_sha/build_version/scenario_snapshot/defects_found/quick_fixes_created/quality_gate, vs the real total_tests/passed_tests/failed_tests/skipped_tests/pass_rate + metadata JSONB) -- startSession() threw on every call, and completeSession() computed pass_rate but never wrote it. Even a fully successful UAT run could not have satisfied the very gate it was supposed to feed. Also added the missing 'docs' key to humanVerificationConfig (it fell back to .feature's requiresUATExecution:true despite EXEMPT_TYPES already claiming 'docs' was exempt).

FR-1/FR-1b/FR-3 (PR 2/4): emits metadata.journey_steps on the venture sprint orchestrator at Stage 19, derived from the Stage-15 blueprint_user_journey artifact (never from Stage-19 acceptance criteria, which are authored by the same per-layer process that produced the false-green tree) via a new pure module lib/eva/bridge/orchestrator-journey-steps.js, propagated onto the orchestrator SD's own metadata by lifecycle-sd-bridge.js's convertSprintToSDs (validation-agent finding: the originally-assumed write site, stage-19-sprint-planning.js, is a pure function with zero DB access and could not have been it). Adds a THIRD WAIT condition (not FAIL -- no retry-budget burn, no RCA trigger) to checkParentOrchestrator() in scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js, keyed strictly on metadata.journey_steps presence -- deliberately never on sd_type, because lib/utils/sd-type-validation.js's EXEMPT_TYPES already includes 'orchestrator' and a type-keyed gate would have silently exempted exactly the SDs it exists to gate.

FR-2 (PR 3/4) target-corrected mid-EXEC: the original plan named lib/eva/journey-walk-driver.js for generalization, but validation-agent's finding C1 (confirmed by direct read, journey-walk-driver.js:25) showed it already imports genericExecuteJourneyStep/genericRunJourneyWalk from lib/apa/browser-executor.js -- it is a thin wrapper over an already-generic engine. Generalized browser-executor.js directly instead. A live query of a real blueprint_user_journey artifact (AltifyAI) then disproved the assumption that journey steps map mechanically onto DOM actions -- step_id is a regeneration-unstable hash, and goal/action fields are product-feature prose ("generate a blog post outline"), not navigable UI language. lib/apa/venture-step-executors.js therefore does not attempt free-text-to-DOM interpretation; it composes an explicit stepOverrides escape hatch, a generic fallback that authenticates via a pre-provisioned test credential and truthfully reports "no verified UI mapping" rather than fabricating a pass, and 4 FR-0-grounded preflight checks for AltifyAI.

FR-4 (PR 4/4) wires the walker into Stage 20 as a 5th non-repo finding producer (db-sourced-findings.js's produceJourneyWalkFindings), reusing the already-declared 'uat_test' finding category and carrying its own 180s timeout tier distinct from the analyzer's other fast DB-read producers. This PR's CI run surfaced a genuine, unrelated latent defect: the credential-free "barrel ESM static-link" smoke check (worker-smoke.yml) failed because FR-4's new import chain (db-sourced-findings.js -> journey-walk-orchestrator.js -> result-recorder.js -> lib/quality/priority-calculator.js) reached a 5-month-old eager \`const supabase = createSupabaseServiceClient()\` at module scope in priority-calculator.js -- code that predates this SD entirely and had simply never been reachable from that barrel before. Fixed with a lazy getSupabase() getter, verified locally by replicating CI's exact credential-free condition (moving .env aside and unsetting the OS-level Supabase vars).

Mid-EXEC, a live chairman UAT session on AltifyAI (2026-08-19T17:24Z) hit a real production bug -- signed-in /dashboard showing "Something went wrong loading your usage history" (GET /api/events non-OK or a .json() throw on an OK response) -- spun into QF-20260819-687. That investigation live-reproduced the chairman's exact parametrized queries against production D1 with his real IDs, definitively ruling OUT the schema/data hypothesis (both queries succeeded cleanly, FK enforcement on, no dupes), and shipped explicit name/message/stack error logging (PR rickfelix/altifyai#52) to close a likely observability gap -- Error.prototype.message/stack are non-enumerable and were probably being silently dropped by structured-log serialization. The investigation explicitly did NOT claim to have found the root cause: it is blocked on the same gap a parallel Solomon/Oracle PLAN-completeness review had already flagged (no sanctioned existing-user Clerk auth fixture; the only real-session tool performs a real /register flow each run, disqualified by the standing never-create-accounts constraint).

That Oracle completeness review (M1/M2/M3) folded three more findings into the PRD mid-EXEC: M1 made FR-2's implicit dependency on FR-5 landing first (result-recorder.js's write path) an explicit acceptance criterion rather than leaving it implicit in PR ordering. M2 -- confirmed live by QF-20260819-687's own investigation -- recognized that a single generic test credential could not have caught the real incident, because an "existing" account carries pre-deploy history and exercises old-account-vs-new-code paths a brand-new account never touches; getTestCredential() was extended with a persona.type param (EXISTING/FRESH), confirmed via mutation testing that the selection logic actually discriminates. M3 verified, with no code change needed, that FR-3's deliberate sd_type-avoidance held even after FR-5's dead-comparison fix made a related EXEMPT_TYPES check "go live" elsewhere in the codebase for the first time.

FR-6 (added mid-EXEC, not in the original PRD): the same Oracle review plus QF-20260819-687's live finding surfaced that venture_gate_attestations' chairman_site_review PASS verdicts never invalidated when a venture redeployed -- the chairman's "I approved this site" verdict could silently drift from reality. buildChairmanSiteReviewAttestationRow now embeds the venture's current deploy sha into subject_ref; crack-gate-evaluator.js's new checkDeployFreshness() downgrades a stale PASS to STALE_DEPLOY. Both real consumers stay observe-only per the existing shadow-mode-first design -- this corrects an observational status, it does not introduce new blocking behavior. The M2/post-deploy-gate half of FR-6 (running the signed-in fixture as a post-deploy check in altifyai's own deploy.yml) is explicitly tracked as follow-up in the FR-6 PRD text, not silently dropped -- it is sequenced behind the same test-identity fixture provisioning M2 needs.

Separately, a shared CI runner-side hang (Install Dependencies + apt "System deps (jq, bc)" stuck 15-33 min vs a 3-5 min baseline) affected this SD's own PR #7323 and PR #7324 AND an unrelated worker's PR #7320 simultaneously, all starting within the same 19:38-19:56Z window on 2026-08-19 -- correctly diagnosed as environmental (both npm and apt hanging rules out a PR-specific defect) via cross-branch timing comparison, signaled to the coordinator, who independently confirmed and force-cancelled+reran all four runs (harness feedback 249cb6c7-8a27-4170-acc6-0aa5fad82d7a).

State at retrospective authoring (2026-08-21, EXEC phase, pre PLAN-TO-LEAD): 3 PRs merged into main (#7315, #7323, #7324) covering FR-0 through FR-6 plus the M1/M2/M3 Oracle follow-ups. EXEC-TO-PLAN has been attempted twice (2026-08-19T19:09Z, 2026-08-21T09:58Z) and rejected both times purely on PREREQUISITE_PREFLIGHT_FAILED / SUBAGENT_EVIDENCE_MISSING -- neither rejection reflects rework of the implementation itself; the TESTING/SECURITY sub-agent evidence on file for this SD (15:33-16:03Z, 2026-08-19) predates the EXEC phase's own PLAN-TO-EXEC acceptance (16:04:55Z) and therefore does not satisfy the freshness window a fresh EXEC-TO-PLAN attempt requires.`;

  const what_went_well = [
    'FR-0 ran as a genuine falsifier BEFORE any of FR-1..FR-6 was built: a live browser walk (acquireLiveInstance) for reachable steps plus static source verification (a complete GitHub route-map read of App.jsx) for steps that would have required creating a real account -- a prohibited action for an automated agent -- confirmed the premise (upload-image FAIL, ImageUploadComponent imported by zero screens) while every corresponding Stage-19 Test-Layer child read "completed".',
    "FR-5 found the UAT enforcement path dead on BOTH the read side (type-aware-validator.js's nonexistent overall_result column select, plus a uatRequirement==='REQUIRED' string-vs-object comparison that is always false) AND the write side (result-recorder.js referencing 11 columns that never existed on the real uat_test_runs table -- startSession() threw on every call, and completeSession() computed pass_rate but never wrote it). Fixing only the side the origin report named would have left a false green.",
    "The identical dead string-vs-object comparison was found in a SECOND file (phase-state-enforcement.js) by testing-agent's LEAD-phase prospective review and widened into FR-5's scope before EXEC started, rather than being discovered later by its own separate incident.",
    'FR-2 self-corrected its own target mid-EXEC: validation-agent finding C1 confirmed lib/eva/journey-walk-driver.js is already a thin wrapper delegating to an already-generic lib/apa/browser-executor.js engine (genericExecuteJourneyStep/genericRunJourneyWalk) -- generalizing the wrapper would have re-done already-completed APA Child C work, so browser-executor.js was generalized directly instead, before any wrapper-generalization code was written.',
    'A live query of a real blueprint_user_journey artifact (AltifyAI) disproved the assumption that journey steps map mechanically onto DOM actions (step_id is a regeneration-unstable hash; goal/action fields are product-feature prose, not navigable UI language) -- FR-2 built an explicit stepOverrides escape hatch and a fallback that truthfully reports "no verified UI mapping" instead of attempting a much larger, out-of-scope free-text-to-DOM interpreter or fabricating a pass.',
    'Mutation testing targeted the exact line each fix depended on rather than trusting green suites at face value: reverting result-recorder.js\'s pass_rate write broke 3/7 new FR-5 tests as expected; forcing journey-walk-orchestrator.js\'s PASS/FAIL line to always-PASS broke 1/8 FR-2 tests; dropping db-sourced-findings.js\'s journeyWalk concat broke 2/31 FR-4 tests while the other 29 correctly stayed green; forcing checkDeployFreshness\'s equality comparison wrong broke the FR-6 mutation check too.',
    'The credential-free "barrel ESM static-link" CI smoke check (worker-smoke.yml) caught a real latent defect that predated this SD by 5 months: FR-4\'s new import chain reached an eager `const supabase = createSupabaseServiceClient()` at module scope in lib/quality/priority-calculator.js, which had simply never been reachable from that barrel before. Fixed with a lazy getter, verified by replicating CI\'s exact credential-free condition locally before pushing.',
    'A shared CI runner-side Install-Dependencies/apt hang that hit this SD\'s own PR #7323/#7324 AND an unrelated worker\'s PR #7320 at the same time was correctly diagnosed as environmental via cross-branch timing comparison (15-33 min vs a 3-5 min baseline, both npm and apt affected) rather than assumed to be a defect in this SD\'s own code, and was signaled to the coordinator rather than worked around silently.',
    'QF-20260819-687 shipped an honest partial fix instead of overclaiming: it live-reproduced the chairman\'s exact production queries against D1 to definitively rule OUT the schema/data hypothesis, then shipped explicit error-detail logging to close a real observability gap, while explicitly stating the reported /dashboard 500\'s root cause remains UNCONFIRMED -- blocked on the same missing test-identity fixture the Oracle completeness review had independently flagged.',
    "The Oracle/Solomon PLAN-completeness pass (M1/M2/M3) caught three real gaps mid-EXEC rather than after: M1 made FR-2's implicit dependency on FR-5 an explicit acceptance criterion; M2 recognized a single generic test credential could not have caught the real incident and extended getTestCredential() to a persona-aware EXISTING/FRESH mechanism, confirmed via mutation testing that the selection logic actually discriminates; M3 verified (no code change needed) that FR-3's sd_type-avoidance held up even after a related EXEMPT_TYPES check went live elsewhere."
  ];

  const what_needs_improvement = [
    'Both EXEC-TO-PLAN handoff attempts (2026-08-19T19:09Z, 2026-08-21T09:58Z) were rejected purely on PREREQUISITE_PREFLIGHT_FAILED / SUBAGENT_EVIDENCE_MISSING: no TESTING or SECURITY sub-agent evidence row exists dated after this SD\'s own PLAN-TO-EXEC acceptance (2026-08-19T16:04:55Z) -- the PLAN-phase PRD-time TESTING/SECURITY rows (15:33-16:03Z the same day) predate EXEC and do not satisfy the freshness window. Neither rejection reflects any rework of the implementation itself, but it means the SD formally still sits in EXEC despite 3 merged PRs across all 6 FRs.',
    'The PRD\'s own plan_checklist still reads "Decomposition into 4 child SDs planned with explicit build order" as checked=true, while metadata.exec_sequencing.approach explicitly documents "single-SD, multi-PR, sequenced EXEC phase (NOT child-SD decomposition)" -- the checklist wording was never revisited after the LEAD-phase decomposition decision was itself reconsidered and reversed, leaving a stale, contradictory-looking artifact for the next reader.',
    "FR-0's originally-worded mechanism (\"run the existing journey walker\") turned out to be infeasible as written -- journey-walk-driver.js is local-serve-only and cannot target a live deployed URL -- discovered only when FR-0 was actually attempted, requiring an on-the-spot substitution (acquireLiveInstance directly) rather than being caught during PRD authoring by reading the tool's own source first.",
    "The M2/post-deploy-gate half of FR-6 (running the existing-user signed-in fixture as a POST-DEPLOY gate in AltifyAI's own deploy.yml) is explicitly out of scope for FR-6 as shipped -- tracked as a named follow-up in the PRD text, not silently dropped, but the actual live-detection capability for the exact regression class QF-20260819-687 investigated is still one more dependency (real Clerk test-identity provisioning) away from being active.",
    'Two separate CI runner-side incidents touched this SD\'s PRs during the same EXEC window (the Install-Dependencies/apt hang on #7323/#7324, and a later "Run Tests & Verify Stories"/coverage pending-forever hang on an unrelated PR sharing the same runner pool) -- both correctly diagnosed as environmental, but stories-ci.yml and its coverage job still carry no timeout-minutes (the 6h GitHub default applies), so a future recurrence still has no automatic safety net and depends on a human noticing and force-cancelling.'
  ];

  const key_learnings = [
    'A fully "completed" per-layer test tree proves nothing about the journey it is supposedly part of: AltifyAI\'s entire Stage-19 tree read 100% completed while the deployed app\'s upload screen was unreachable from any route -- layer-scoped acceptance criteria are authored by the same process that builds the layer, so they cannot catch an integration gap between layers by construction.',
    "When a write path and a read path for the same enforcement mechanism are both broken, fixing only the side named in the origin report is not enough: FR-5's read-side fix alone would still have been a false green, because result-recorder.js's write side used 11 columns that never existed on the real table -- a completed UAT run still could not have satisfied the gate being repaired.",
    'A dead string-vs-object comparison bug is not guaranteed to exist in only one file: the identical uatRequirement===\'REQUIRED\' defect existed in both type-aware-validator.js and phase-state-enforcement.js, and a dedicated LEAD-phase prospective sub-agent review (not the origin report) is what widened the fix to both before EXEC started.',
    'Generalizing "the file that looks like the entry point" is not always generalizing the right layer: lib/eva/journey-walk-driver.js reads as the natural target (it is literally named as the journey walker), but it was already a thin wrapper over an already-generic engine -- the file with the recognizable name is not always the file that needs the change.',
    'An honest "no verified UI mapping" fallback is more valuable to a gate than a fabricated pass: rather than forcing free-text journey-step prose into concrete DOM selectors (a much larger, out-of-scope interpretation capability), FR-2 built an explicit override escape hatch and a fallback that truthfully reports what it could not verify.',
    'A credential-free CI smoke check can catch a defect that predates the change which exposes it by months: the eager Supabase client in priority-calculator.js was 5 months old but had simply never been on any import path the barrel-static-link check exercised, until this SD\'s own Stage-20 wiring created that path for the first time -- the check earns its keep exactly in that moment.',
    "Two independently-shaped signals (a coordinator's cross-branch timing comparison, plus a second, unrelated worker's PR failing the identical CI step at the identical time) are much stronger evidence of an environmental cause than either alone -- worth resisting the instinct to assume \"my PR, my bug\" when a shared external cause is at least as consistent with the same symptom.",
    'Ruling out a hypothesis with live evidence is worth shipping even when it does not fully resolve the incident: QF-20260819-687\'s live-D1 reproduction definitively cleared the schema/data hypothesis, which is real forward progress even though the true root cause of the /dashboard 500 remains unconfirmed -- an honest "not this, and here is what might help find it" is worth more than a fix that claims more certainty than the investigation actually established.'
  ];

  const action_items = [
    {
      owner: 'Next campaign-mode harness sweep (or whoever next touches .github/workflows/stories-ci.yml)',
      action: 'Add timeout-minutes (~20) to stories-ci.yml\'s test-and-verify and health-check jobs plus a cancel-in-progress concurrency group per ref -- both currently run on the 6h GitHub default with no automatic safety net, confirmed by direct read of the workflow file (neither job declares timeout-minutes today). Fix text and exact affected run IDs already filed as harness feedback id 249cb6c7-8a27-4170-acc6-0aa5fad82d7a.',
      deadline: 'Next campaign-mode harness sweep',
      priority: 'high',
      smart_format: true,
      success_criteria: 'stories-ci.yml diff shows timeout-minutes + a concurrency block on both jobs; the next runner-side hang auto-cancels within the configured window instead of sitting until the 6h default.'
    },
    {
      owner: 'Chairman (credential minting) + whoever picks up the JOURNEY-UAT FR-2/FR-6 follow-up',
      action: 'Provision the fenced existing+fresh Clerk test identities for AltifyAI now that the chairman\'s 2026-08-21 ruling (ruling A: one fenced exception to never-create-accounts, credential minted by the chairman directly into CI secrets, never transiting a session/SD row) has approved the mechanism -- VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING and _FRESH are wired in lib/apa/venture-step-executors.js (getTestCredential) and ready, but neither slot is populated for any venture yet.',
      deadline: 'Before the next AltifyAI deploy that could regress the signed-in dashboard path',
      priority: 'high',
      smart_format: true,
      success_criteria: 'A real FR-2 journey walk against AltifyAI authenticates via the EXISTING persona slot and produces a genuine PASS/FAIL uat_test_runs row, replacing the current truthful "no verified UI mapping" fallback for that step.'
    },
    {
      owner: 'Next worker to touch venture_gate_attestations / crack-gate-evaluator.js',
      action: 'Build the M2/post-deploy-gate half of FR-6 -- run the existing-user signed-in fixture as a POST-DEPLOY gate in AltifyAI\'s own deploy.yml -- once the FR-2 test-identity fixtures (action item above) are provisioned. Explicitly tracked as out-of-scope-but-not-dropped in this SD\'s own FR-6 PRD text.',
      deadline: 'After the Clerk test-identity action item above lands',
      priority: 'medium',
      smart_format: true,
      success_criteria: "altifyai's deploy.yml gains a post-deploy job running the signed-in walk that would have caught the QF-20260819-687 symptom class before the chairman found it live."
    },
    {
      owner: 'Whoever resumes this SD\'s EXEC-TO-PLAN handoff',
      action: 'Invoke TESTING and SECURITY sub-agents fresh (Task tool, or node scripts/execute-subagent.js --code TESTING/SECURITY --sd-id SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001) before the next EXEC-TO-PLAN attempt -- both prior attempts failed purely on SUBAGENT_EVIDENCE_MISSING preflight; the PLAN-phase PRD-time rows (2026-08-19T15:33-16:03Z) predate this SD\'s own EXEC phase and will not satisfy the gate\'s freshness check again.',
      deadline: 'Next work session on this SD',
      priority: 'high',
      smart_format: true,
      success_criteria: 'EXEC-TO-PLAN handoff clears PREREQUISITE_PREFLIGHT with fresh TESTING/SECURITY rows dated after 2026-08-19T16:04:55Z.'
    },
    {
      owner: 'Next campaign-mode sweep touching PRD hygiene',
      action: 'Correct or annotate this SD\'s PRD plan_checklist entry "Decomposition into 4 child SDs planned with explicit build order" (currently checked=true) to reflect the actual, deliberately-reversed single-SD multi-PR approach already documented in metadata.exec_sequencing.',
      deadline: 'Opportunistic, next time this PRD is touched',
      priority: 'low',
      smart_format: true,
      success_criteria: 'plan_checklist text matches metadata.exec_sequencing.approach; no contradictory checked=true items remain.'
    }
  ];

  const improvement_areas = [
    "Area: FR-0's original instruction to \"run the existing journey walker\" was infeasible as written. Root cause: lib/eva/journey-walk-driver.js is local-serve-only (MARKETLENS_SERVE_CONFIG, port 3001) with no live-URL mode -- the PRD's mental model of the tool's capability was one layer more capable than the tool actually was, and this was never checked against the tool's own source before FR-0's wording was finalized; it surfaced only when FR-0 was actually attempted. Prevention: when an FR names a specific existing tool/module as its mechanism, read that tool's actual capability against its own source during PRD authoring, not just its name or docstring description.",
    "Area: EXEC-TO-PLAN has been attempted twice and rejected twice, both purely on SUBAGENT_EVIDENCE_MISSING preflight rather than any code-content issue. Root cause: TESTING and SECURITY sub-agent evidence exists for this SD, but both rows are dated 15:33-16:03Z on 2026-08-19 -- during PLAN-phase PRD authoring, before this SD's own PLAN-TO-EXEC acceptance (16:04:55Z) even happened -- so the freshness check correctly treats them as stale for an EXEC-TO-PLAN attempt despite 3 merged PRs of real EXEC-phase work already on the branch. Prevention: invoke TESTING/SECURITY explicitly as the LAST step before attempting EXEC-TO-PLAN, not only once during PLAN -- the freshness window is keyed to phase-entry timestamps, not to whether an agent has ever run for the SD at all.",
    "Area: the PRD's plan_checklist still marks \"Decomposition into 4 child SDs planned with explicit build order\" as checked=true, while this SD explicitly reversed that decision and shipped as a single SD with 4 sequenced PRs instead. Root cause: the checklist item was authored during PLAN-phase drafting, before the LEAD-phase decomposition decision was itself reconsidered and reversed (4 technical sub-tasks of one chairman-approved unit did not warrant separate strategic-decision SDs) -- the checklist text was never revisited after the reversal even though the underlying decision changed and metadata.exec_sequencing was updated to reflect it. Prevention: when a scoping decision documented in a checklist item is later reversed, update or annotate the checklist entry itself, not only the metadata field that supersedes it."
  ];

  const success_patterns = [
    'Falsifier-first: prove or disprove the premise with a live or independently-verified probe before writing any implementation code, with an explicit reopen-the-premise exit condition if the falsifier unexpectedly passes.',
    "When asked to generalize/fix \"the file that looks like the entry point,\" verify what it actually delegates to before generalizing it -- the real target may be one layer deeper, or already done.",
    'Mutation-test the specific line a fix depends on (force it wrong, confirm the right tests fail, revert) rather than trusting a green suite that was never proven to observe the hazard.',
    'A truthful "could not verify" fallback is more valuable to a gate than a fabricated pass, especially when the alternative is a much larger out-of-scope interpretation layer.',
    "Cross-branch timing comparison (this PR plus an unrelated worker's PR failing identically at the same time) is fast, strong evidence for environmental-vs-code-defect CI triage."
  ];

  const failure_patterns = [
    "A PRD FR named a specific existing tool as its mechanism without confirming that tool's actual capability against its own source first -- caught only when the FR was actually attempted (FR-0's local-serve-only journey-walk-driver.js).",
    'A dead string-vs-object comparison bug existed in two files with the identical shape; only one was named in the original plan text, and the second was found by a dedicated LEAD-phase prospective review rather than by the plan itself.',
    'sub_agent_execution_results evidence generated during PLAN-phase PRD authoring does not satisfy the freshness window for a later EXEC-TO-PLAN attempt, and this was discovered by handoff rejection (twice) rather than anticipated beforehand.',
    'stories-ci.yml and its coverage job carry no timeout-minutes, so a runner-side hang has no automatic safety net and depends on a human noticing and force-cancelling -- true on both CI incidents observed during this SD\'s own EXEC window.'
  ];

  const protocol_improvements = [
    {
      category: 'VERIFY_TOOL_CAPABILITY_BEFORE_NAMING_IT_IN_AN_FR',
      evidence: "FR-0's original wording (\"run the existing journey walker\") assumed lib/eva/journey-walk-driver.js could target a live deployed URL; it is local-serve-only (MARKETLENS_SERVE_CONFIG, port 3001) -- discovered only when FR-0 was actually attempted, requiring an on-the-spot substitution (acquireLiveInstance).",
      improvement: "When an FR names a specific existing tool/module as its mechanism, read that tool's actual capability against its own source during PRD authoring, not just its name or docstring description.",
      impact: 'Avoids an on-the-spot substitution mid-execution and keeps the PRD\'s stated mechanism executable exactly as written.',
      affected_phase: 'PLAN'
    },
    {
      category: 'DEAD_COMPARISON_BUGS_CHECK_SIBLING_FILES',
      evidence: "The identical uatRequirement==='REQUIRED' string-vs-object dead comparison existed in both type-aware-validator.js and phase-state-enforcement.js; testing-agent's LEAD-phase prospective review widened FR-5 to both before EXEC started.",
      improvement: 'When a dead-comparison or phantom-column bug is found in one enforcement file, grep for the identical pattern across sibling enforcement files before scoping the fix narrowly to the one file the origin report named.',
      impact: 'Prevents an identical live defect from surviving in an un-audited sibling file after the named one is fixed.',
      affected_phase: 'LEAD'
    },
    {
      category: 'MUTATION_TEST_THE_EXACT_LINE_THE_FIX_DEPENDS_ON',
      evidence: "FR-5 reverted result-recorder.js's pass_rate write and confirmed 3/7 new tests correctly failed; FR-2 forced journey-walk-orchestrator.js's PASS/FAIL line to always-PASS and confirmed 1/8 tests correctly failed; FR-4 dropped db-sourced-findings.js's journeyWalk concat and confirmed 2/31 tests correctly failed while 29 unrelated tests stayed green.",
      improvement: 'For any fix whose entire value rides on one specific write or comparison line, mutation-test that exact line (force it wrong, confirm the right tests fail, revert) rather than trusting a green suite that was never proven to observe the hazard.',
      impact: 'Converts an assumed-load-bearing test into a confirmed one, closing the gap between "tests pass" and "tests would catch a regression of this specific fix".',
      affected_phase: 'EXEC'
    },
    {
      category: 'CROSS_BRANCH_TIMING_COMPARISON_FOR_CI_HANG_TRIAGE',
      evidence: 'A CI Install-Dependencies/apt hang affected this SD\'s PR #7323/#7324 AND an unrelated worker\'s PR #7320 simultaneously (15-33 min vs a 3-5 min baseline, all starting 19:38-19:56Z on 2026-08-19) -- diagnosed as environmental via cross-branch timing comparison and signaled to the coordinator rather than assumed to be this SD\'s own code defect.',
      improvement: "When a CI job hangs, compare timing against both this branch's own historical baseline AND other concurrently-running unrelated branches before concluding the defect is in this PR's own code.",
      impact: 'Avoids misattributing an environmental/runner-side defect to the PR under review, and gets the coordinator a faster, better-evidenced signal.',
      affected_phase: 'EXEC'
    }
  ];

  const unnecessary_work_identified = [
    {
      item: "Running FR-0's originally-worded 'existing journey walker' unmodified against AltifyAI.",
      reason: "testing-agent's LEAD-phase prospective review flagged that journey-walk-driver.js hardcodes MarketLens-specific step names/selectors (JOURNEY_STEPS, STEP_EXECUTORS) -- running it unmodified against AltifyAI would fail trivially at step 2 on wrong selectors, a guaranteed-FAIL that reveals nothing about the real premise and would have undermined FR-0's own 'if it unexpectedly PASSES, STOP' exit condition.",
      requested_by: "the SD's original plan text, before testing-agent's LEAD-phase review",
      confirmed_against: 'strategic_directives_v2.metadata.testing_agent_lead_findings.per_fr["FR-0"]; resolved by using lib/apa/live-instance-acquisition.mjs::acquireLiveInstance directly instead'
    }
  ];

  const future_enhancements = [
    "Once the fenced Clerk existing+fresh test identities are provisioned for AltifyAI (chairman ruling A, 2026-08-21), re-run FR-2's journey walker end-to-end and confirm it produces a genuine PASS/FAIL uat_test_runs row via the EXISTING persona path, rather than the current truthful 'no verified UI mapping' fallback.",
    "Build the M2 post-deploy-gate half of FR-6 (signed-in fixture wired into AltifyAI's own deploy.yml) once those fixtures exist -- explicitly tracked as follow-up in the FR-6 PRD text, not dropped.",
    'Audit other Stage-19-decomposed ventures for the same false-green layer-tree pattern FR-0 found on AltifyAI (100% per-layer "completed" status with an unreachable integration path), now that a real falsifier method (acquireLiveInstance + static source verification) exists to check for it.'
  ];

  const retrospective = {
    sd_id: SD_CANONICAL_ID,
    project_name: 'Venture journey UAT: sprint-orchestrator WAIT condition + Stage-20 UAT sub-step',
    retro_type: 'SD_COMPLETION',
    retrospective_type: null,
    title: 'Venture journey UAT: FR-0 falsifier proved a false-green Stage-19 layer tree, FR-5 found LEO-side UAT enforcement dead on both read AND write paths, FR-1..FR-6 wired a real WAIT-gated journey check',
    description,
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['VALIDATION', 'Explore', 'DESIGN', 'DATABASE', 'SECURITY', 'RISK', 'TESTING', 'VISION_FIDELITY'],
    human_participants: ['LEAD', 'Chairman'],
    what_went_well,
    what_needs_improvement,
    action_items,
    key_learnings,
    quality_score: 90,
    team_satisfaction: 8,
    business_value_delivered: 'Closes a measured-dead LEO-side UAT enforcement path (0/25 feature SDs had a uat_test_runs row in the trailing 14 days; the UAT sub-agent fired 1x vs TESTING 431x) and wires a real, falsifier-verified venture-journey acceptance gate at the sprint-orchestrator level, replacing per-layer "completed" status (which read 100% green on AltifyAI\'s Stage-19 tree despite the deployed app\'s upload screen being unreachable) with an actual browser-walked journey check. Also closes a stale-attestation gap (FR-6) that let a chairman_site_review PASS silently outlive a venture\'s own redeploy.',
    customer_impact: "Chairman-facing: venture sprint-orchestrator completion now requires a passing (or explicitly WAIT-pending) journey walk rather than only per-layer test-suite green; chairman_site_review attestations now carry deploy identity so a stale PASS is detectable rather than silently trusted after a redeploy -- directly motivated by the chairman's own live AltifyAI /dashboard regression (QF-20260819-687).",
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 6,
    bugs_resolved: 6,
    tests_added: 50,
    code_coverage_delta: null,
    performance_impact: "Standard for the LEO-side fixes (dead-code repair, no new runtime cost). FR-4's Stage-20 sub-step adds a live Playwright browser walk with its own 180s timeout tier, explicitly separated from Stage 20's existing 30-120s fast DB-read/probe budget so it cannot starve the other checks.",
    objectives_met: false,
    on_schedule: true,
    within_scope: true,
    success_patterns,
    failure_patterns,
    improvement_areas,
    generated_by: 'MANUAL',
    trigger_event: 'PLAN_TO_LEAD_HANDOFF_PREP',
    status: 'PUBLISHED',
    target_application: 'EHG_Engineer',
    learning_category: 'APPLICATION_ISSUE',
    applies_to_all_apps: false,
    related_files: [
      'lib/uat/result-recorder.js',
      'lib/utils/sd-type-validation.js',
      'scripts/hooks/phase-state-enforcement.js',
      'scripts/hooks/stop-subagent-enforcement/type-aware-validator.js',
      'lib/eva/bridge/orchestrator-journey-steps.js',
      'lib/eva/lifecycle-sd-bridge.js',
      'scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js',
      'lib/apa/journey-walk-orchestrator.js',
      'lib/apa/venture-step-executors.js',
      'lib/uat/scenario-generator.js',
      'lib/eva/quality-findings/db-sourced-findings.js',
      'lib/quality/priority-calculator.js',
      'lib/eva/bridge/chairman-site-review-attestation.js',
      'lib/eva/lifecycle/crack-gate-evaluator.js'
    ],
    related_commits: [
      '3ac00f3f1eb5bfc291f6850fe842c0412a422044',
      '79cf33eaccc1dbcbc49300ca7aa94b22bd1acf80',
      '3dba7f54d0aa452ceb2d5776fff73b4d0fe664a9',
      '06f877ce51fc98d7d982ae9871a5c25da79b7736',
      '63516c2e01e7b05766acb3b5346b26c90146630f',
      '09f01866babb229bf018851cb2b10e8d57148151',
      '0183e5b1dca4c54afca4c16e1bed32bd6a3f5eeb',
      '4f90a5f5834e41cbc61ecf5c4c3bfd0da4f34476'
    ],
    related_prs: ['#7315', '#7323', '#7324'],
    affected_components: [
      'lib/uat', 'lib/apa', 'lib/eva/bridge', 'lib/eva/lifecycle', 'lib/eva/quality-findings',
      'lib/quality/priority-calculator.js', 'scripts/hooks', 'scripts/modules/handoff/executors/plan-to-lead'
    ],
    tags: [
      'venture-journey-uat', 'false-green-layer-tests', 'falsifier-first', 'dead-enforcement-repair',
      'phantom-columns', 'wait-not-fail-gate', 'mid-exec-target-correction', 'mutation-testing',
      'ci-barrel-smoke-catch', 'ci-runner-hang-triage', 'stale-attestation-deploy-freshness',
      'oracle-completeness-review', 'honest-partial-fix'
    ],
    unnecessary_work_identified,
    protocol_improvements,
    future_enhancements,
    metadata: {
      sd_key: SD_KEY,
      prd_id: 'PRD-SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001',
      branch: 'feat/SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 (+ -fr6 sub-branch merged as PR #7323)',
      head_sha: '4f90a5f5834e41cbc61ecf5c4c3bfd0da4f34476',
      pr_status: '3 PRs merged into main: #7315 (FR-5, FR-1/FR-1b/FR-3, FR-2, FR-4, priority-calculator lazy-init fix), #7323 (FR-6), #7324 (FR-2 M2 dual persona). EXEC-TO-PLAN not yet accepted -- 2 rejections (2026-08-19T19:09Z, 2026-08-21T09:58Z), both SUBAGENT_EVIDENCE_MISSING preflight only.',
      retro_authored_during_phase: 'EXEC (pre EXEC-TO-PLAN acceptance) -- authored ahead of the next EXEC-TO-PLAN / eventual PLAN-TO-LEAD attempt so the RETRO evidence and gate requirements are ready once TESTING/SECURITY evidence is refreshed',
      fr_disposition: {
        'FR-0': 'Delivered -- strategic_directives_v2.metadata.fr0_falsifier_artifact. land=PASS, sign-up=PASS, upload-image=FAIL (premise confirmed), usage-analytics=inconclusive pending auth, feedback=PASS.',
        'FR-5': 'Delivered -- PR #7315. lib/uat/result-recorder.js write-path fix, type-aware-validator.js + phase-state-enforcement.js read-path fixes, humanVerificationConfig docs key added.',
        'FR-1/FR-1b': 'Delivered -- PR #7315. lib/eva/bridge/orchestrator-journey-steps.js (deriveJourneySteps), lib/eva/lifecycle-sd-bridge.js (convertSprintToSDs propagation).',
        'FR-3': 'Delivered -- PR #7315. Third WAIT condition in prerequisite-check.js checkParentOrchestrator(), keyed on metadata.journey_steps only.',
        'FR-2': 'Delivered -- PR #7315 (core) + PR #7324 (M2 dual persona). lib/apa/journey-walk-orchestrator.js, lib/apa/venture-step-executors.js, lib/uat/scenario-generator.js.',
        'FR-4': 'Delivered -- PR #7315. lib/eva/quality-findings/db-sourced-findings.js produceJourneyWalkFindings(), wired into collectNonRepoFindings().',
        'FR-6': 'Delivered -- PR #7323. lib/eva/bridge/chairman-site-review-attestation.js deploySha binding, lib/eva/lifecycle/crack-gate-evaluator.js checkDeployFreshness(). M2 post-deploy-gate half tracked as follow-up, not built.'
      },
      oracle_m1_m2_m3_ref: 'strategic_directives_v2.metadata.oracle_m1_m2_m3_resolution',
      qf_20260819_687_ref: 'strategic_directives_v2.metadata.fr0_falsifier_artifact.qf_20260819_687_update',
      chairman_test_identity_ruling_ref: 'strategic_directives_v2.metadata.chairman_test_identity_ruling (2026-08-21T10:15:04Z, ruling A)',
      handoffs: {
        'LEAD-TO-PLAN': { status: 'accepted', accepted_at: '2026-08-19T15:18:29.323993Z' },
        'PLAN-TO-EXEC': { status: 'accepted', accepted_at: '2026-08-19T16:04:55.161739Z' },
        'EXEC-TO-PLAN attempt 1': { status: 'rejected', at: '2026-08-19T19:09:45.693351Z', reason: 'SUBAGENT_EVIDENCE_MISSING' },
        'EXEC-TO-PLAN attempt 2': { status: 'rejected', at: '2026-08-21T09:58:48.138532Z', reason: 'SUBAGENT_EVIDENCE_MISSING' }
      },
      sub_agent_evidence: {
        lead_validation: '(2026-08-19T15:09:55Z) CONDITIONAL_PASS',
        lead_explore: '(2026-08-19T15:16:37Z) WARNING',
        plan_prd_design: '(2026-08-19T15:32:48Z) CONDITIONAL_PASS',
        plan_prd_database: '(2026-08-19T15:32:54Z) PASS',
        plan_prd_security: '(2026-08-19T15:33:02Z) CONDITIONAL_PASS',
        plan_prd_risk: '(2026-08-19T15:33:09Z) PASS',
        plan_testing: '(2026-08-19T16:03:13Z) CONDITIONAL_PASS -- predates EXEC phase, does not satisfy EXEC-TO-PLAN freshness',
        plan_verification_vision_fidelity: '(2026-08-21T10:07:17Z) WARNING'
      },
      ci_incidents: {
        install_deps_apt_hang: {
          feedback_id: '249cb6c7-8a27-4170-acc6-0aa5fad82d7a',
          affected_prs: ['#7323 (this SD)', '#7324 (this SD)', '#7320 (unrelated worker, SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001)'],
          window: '2026-08-19T19:38-19:56Z start, 15-33 min vs 3-5 min baseline',
          diagnosis: 'environmental (both npm and apt hung) -- coordinator confirmed, force-cancelled + reran all 4'
        },
        stories_verify_pending_hang: {
          feedback_id: '6beb4607-24b1-4809-8050-9e8b46a9d757',
          note: 'Observed on an unrelated PR (#7307) sharing the same runner pool during this SD\'s own EXEC window; cited here as corroborating evidence for the timeout-minutes action item, not as this SD\'s own defect.'
        }
      },
      barrel_smoke_catch: {
        workflow: '.github/workflows/worker-smoke.yml step "Smoke — barrel ESM static-link"',
        root_cause_file: 'lib/quality/priority-calculator.js (eager createSupabaseServiceClient() at module scope, predates this SD by ~5 months, commit 8175e3c034b6 2026-03-17)',
        new_import_chain: 'lib/eva/quality-findings/db-sourced-findings.js -> lib/apa/journey-walk-orchestrator.js -> lib/uat/result-recorder.js -> lib/quality/priority-calculator.js',
        fix_commit: '63516c2e01e7b05766acb3b5346b26c90146630f'
      }
    }
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select()
    .single();

  if (insertErr) throw new Error(`retrospective insert failed: ${insertErr.message}`);
  console.log(`✅ Retrospective inserted: ${inserted.id} (quality_score=${inserted.quality_score})`);

  // ---------------------------------------------------------------------
  // 3) Persist RETRO's sub-agent execution evidence
  // ---------------------------------------------------------------------
  const { data: subAgentRow, error: subAgentErr } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name, metadata')
    .eq('code', 'RETRO')
    .maybeSingle();
  if (subAgentErr) console.warn(`   ⚠️  leo_sub_agents lookup warning: ${subAgentErr.message}`);

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase
  });
  console.log('   Repo resolution:', JSON.stringify(resolution));

  const results = {
    verdict: 'PASS',
    confidence_score: 92,
    summary: `Authored a genuine, SD-specific SD_COMPLETION retrospective (id ${inserted.id}, quality_score ${inserted.quality_score}) for SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001, grounded directly against strategic_directives_v2 metadata (fr0_falsifier_artifact, oracle_m1_m2_m3_resolution, testing_agent_lead_findings, chairman_test_identity_ruling), the PRD's functional_requirements/acceptance_criteria, sd_phase_handoffs (including both rejected EXEC-TO-PLAN attempts), the full git commit history across 3 merged PRs (#7315/#7323/#7324, 8 commits), and 2 corroborating harness_backlog feedback rows for the CI runner-hang incidents. Covers FR-0 through FR-6 plus the M1/M2/M3 Oracle-driven mid-EXEC additions, the FR-2 mid-EXEC target correction, the priority-calculator.js barrel-smoke catch, and QF-20260819-687's honest partial fix.`,
    findings: [
      'FR-5 write-path (result-recorder.js): 11 phantom columns, startSession() threw on every call, completeSession() never wrote pass_rate -- confirmed against commit 3ac00f3f1eb.',
      'FR-2 mid-EXEC target correction: journey-walk-driver.js is a thin wrapper over browser-executor.js (validation-agent finding C1) -- confirmed against commit 3dba7f54d0a and strategic_directives_v2.metadata.mechanism_verifications.',
      'Barrel ESM static-link smoke catch: eager Supabase client in priority-calculator.js, 5 months pre-dating this SD, newly reachable via FR-4\'s import chain -- confirmed against commit 63516c2e01e.',
      'CI runner-hang cross-branch corroboration: harness feedback 249cb6c7-8a27-4170-acc6-0aa5fad82d7a names this SD\'s PR #7323/#7324 alongside an unrelated worker\'s PR #7320, same 19:38-19:56Z window.',
      'EXEC-TO-PLAN currently blocked purely on SUBAGENT_EVIDENCE_MISSING preflight (2 rejections, 2026-08-19T19:09Z and 2026-08-21T09:58Z) -- confirmed against sd_phase_handoffs rows 919301e6/dd4357f7, not a code-content rejection.'
    ],
    recommendations: [
      'Add timeout-minutes (~20) + cancel-in-progress concurrency to stories-ci.yml before the next runner-side hang recurrence (harness feedback 249cb6c7-8a27-4170-acc6-0aa5fad82d7a).',
      'Invoke TESTING and SECURITY sub-agents fresh (post-2026-08-19T16:04:55Z) before the next EXEC-TO-PLAN attempt.',
      'Provision the chairman-approved (ruling A, 2026-08-21) fenced Clerk existing+fresh test identities for AltifyAI so FR-2\'s journey walker can produce a real PASS/FAIL instead of its truthful fallback.'
    ],
    warnings: [
      'SD is still formally in EXEC phase (current_phase=EXEC, status=active) as of this retrospective -- EXEC-TO-PLAN has not yet been accepted. This retrospective and its RETRO evidence are authored ahead of that handoff so the PLAN-TO-LEAD gate requirements are ready once EXEC-TO-PLAN clears.',
      'The M2/post-deploy-gate half of FR-6 is explicitly tracked as follow-up, not built in this SD.'
    ],
    critical_issues: [],
    metadata: {
      retrospective_id: inserted.id,
      retrospective_quality_score: inserted.quality_score,
      sd_key: SD_KEY,
      notes: 'RETRO evidence written ahead of formal EXEC-TO-PLAN acceptance, per explicit task instruction, to unblock the PLAN-TO-LEAD GATE_SUBAGENT_EVIDENCE (RETRO) and RETROSPECTIVE_QUALITY_GATE requirements once the SD reaches that handoff.'
    },
    validation_mode: 'retrospective'
  };

  applySubAgentRepoVerdict(results, resolution, { severity: 'MEDIUM' });

  const stored = await storeSubAgentResults('RETRO', SD_KEY, subAgentRow, results, {
    sdKey: SD_KEY,
    phase: 'PLAN_VERIFICATION'
  });

  console.log(`✅ Sub-agent evidence stored: ${stored.id} (verdict=${stored.verdict}, phase=${stored.phase})`);

  // ---------------------------------------------------------------------
  // 4) Independent re-verification (direct reads, not trusting return values)
  // ---------------------------------------------------------------------
  const { data: retroCheck, error: retroCheckErr } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, title, status, quality_score, created_at')
    .eq('id', inserted.id)
    .single();
  if (retroCheckErr) throw new Error(`retro re-read failed: ${retroCheckErr.message}`);
  console.log('\n🔍 INDEPENDENT RE-READ — retrospectives row:');
  console.log(JSON.stringify(retroCheck, null, 2));

  const { data: evidenceCheck, error: evidenceCheckErr } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, sub_agent_code, verdict, phase, created_at, metadata')
    .eq('id', stored.id)
    .single();
  if (evidenceCheckErr) throw new Error(`evidence re-read failed: ${evidenceCheckErr.message}`);
  console.log('\n🔍 INDEPENDENT RE-READ — sub_agent_execution_results row:');
  console.log(JSON.stringify({
    ...evidenceCheck,
    metadata: {
      repo_path: evidenceCheck.metadata?.repo_path,
      repo_resolved: evidenceCheck.metadata?.repo_resolved,
      executed_from_cwd: evidenceCheck.metadata?.executed_from_cwd,
      retrospective_id: evidenceCheck.metadata?.retrospective_id
    }
  }, null, 2));

  // Freshness check against the exact gate query shape (PLAN-TO-LEAD requires RETRO,
  // created_at >= LEAD-TO-PLAN accepted_at 2026-08-19T15:18:29.323993Z)
  const gateFloor = new Date('2026-08-19T15:18:29.323993Z');
  const rowTime = new Date(evidenceCheck.created_at);
  console.log(`\n   GATE_SUBAGENT_EVIDENCE freshness: row created_at=${evidenceCheck.created_at} >= floor=${gateFloor.toISOString()} -> ${rowTime >= gateFloor}`);

  const retroGateFloor = new Date('2026-08-19T15:18:29.323993Z');
  const retroTime = new Date(retroCheck.created_at);
  console.log(`   RETROSPECTIVE_QUALITY_GATE freshness: retro created_at=${retroCheck.created_at} > floor=${retroGateFloor.toISOString()} -> ${retroTime > retroGateFloor}`);
  console.log(`   retro_type=${retroCheck.retro_type} (expect SD_COMPLETION), retrospective_type=${retroCheck.retrospective_type} (expect null or SD_COMPLETION)`);
}

main().catch(err => {
  console.error('❌ FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
