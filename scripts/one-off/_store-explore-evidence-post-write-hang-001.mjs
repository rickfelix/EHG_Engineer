import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sdKey = 'SD-LEO-FIX-POST-WRITE-HANG-001';
  const { data: sd } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', sdKey).maybeSingle();

  const results = {
    verdict: 'PASS',
    confidence: 95,
    summary: 'Independent Explore-agent investigation of all 4 scripts named by QF-20260912-150 (original 2 + 2 addenda). Confirmed: none of the 4 import lib/completion/post-write-stage.js; existing try/catch wrapping around most steps protects against THROWS only, never HANGS. lead-final-approval/index.js has 5 bare/unwrapped post-write awaits (worse than my own manual read found: 3, not 5). learning/sd-creation.js has exactly 3 unwrapped post-write steps, confirmed as the real call-site (learning/index.js calls a 3-arg wrapper in executor.js, not sd-creation.js directly -- the fix belongs in sd-creation.js). sd-start.js and add-prd-to-database.js each have their own PRIOR partial fixes for a related-but-distinct hang shape (heartbeat/socket keep-alive after the main promise resolves) that do NOT protect against a hang INSIDE the awaited chain -- the actual shape of the live specimens.',
    findings: [
      '1) scripts/modules/handoff/executors/lead-final-approval/index.js: core write = stampCompletion (L863) + stampExecutionContext (L865). 5 CONFIRMED bare/unwrapped awaits in the post-write tail: resolveLearningItems (L905), rescoreOriginalSD (L939), runProgrammaticRetrospective (L988, call-site only -- internally the function spawnSync()s with a 60s timeout, lower risk), releaseSessionClaim (L1024), checkAndCompleteParentSD (L1115, inside an if(sd.parent_sd_id) branch, no try/catch). ~20 OTHER steps already have individual try/catch+console.warn wrappers (recordSdCompleted, autoCloseFeedback, updateKRFromSDCompletion, runCapabilityScoringOnCompletion, analyzeSDRejections, runShipReviewFindingsPopulator, runQfResolutionLinkAdvisory, runRankOnCompletionHook, runRoadmapStampOnCompletionHook, runPostCompletionTailPopulator, runVisionHealIfTriggered, runFinalApprovalShipping, orchestrator-completion-hook, worktree cleanup) but NONE are timeout-bounded -- a try/catch alone does nothing for an unresolved promise. lib/completion/post-write-stage.js own header comment explicitly names this file as the QF-20260912-697 author\'s deliberately-deferred next target.',
      '2) scripts/modules/learning/index.js + sd-creation.js: autoApproveCommand (learning/index.js:263) calls executeSDCreationWorkflow, which is executor.js\'s 3-arg re-export (L63-65), NOT sd-creation.js\'s 4-arg function directly -- executor.js injects createDecisionRecord as the 3rd positional arg before delegating to sd-creation.js\'s executeSDCreationWorkflowInternal. The real 3 unwrapped post-write steps live in sd-creation.js: tagSourceItems (L407), createDecisionRecord (L413-417, itself doing an unguarded supabase insert internally in decision-management.js), and the learning_decisions UPDATE (L421-436, conditional on decisionRecord.id not starting with LOCAL-). Confirmed these are the ONLY 3 -- the interactive applyCommand path (learning/index.js:319) goes through the identical function body post-core-write, no branching difference.',
      '3) scripts/sd-start.js: core writes = claimGuard (L1071) + resolveWorkdir/worktree creation (L1573). ~25 post-write steps follow across a 650-line tail; most already try/caught, but 3 are bare: isOrchestratorSync import (L1850, not inside any try), verifyHandoffIntegrity (L2072, fully unguarded), getNextHandoff (L2149, bare but pure in-memory lookup so low actual risk). SURPRISING: this file already has a documented PRIOR fix (comment at L2224-2237) for a related hang -- startHeartbeat()\'s ref\'d setInterval kept the event loop open after main() resolved, fixed via stopHeartbeat()+process.exit(0) in main().then(). That fix only helps once main()\'s promise resolves; it does nothing if main() itself hangs inside the 650-line tail, which is the exact shape of the live specimen (claim+worktree landed, then hung). Also surprising: L2166-2171 (the isStrandedAtLeadFinal auto-chain branch) has an internal execSync timeout of 300000ms (5 min) -- LARGER than the reported ~120s external kill window, so it looks protected but is not, relative to the caller\'s real budget.',
      '4) scripts/add-prd-to-database.js: thin CLI shim delegating to scripts/prd/index.js::addPRDToDatabase(). Core write = createPRDWithValidatedContent (L183, inserts product_requirements_v2). 3 post-write steps, all inside one outer try whose catch calls process.exit(1) on ANY throw: updatePRDWithAnalyses (L232-235, bare), handleComponentRecommendations (L238, internally fail-soft against throws only, contains its own unguarded embeddings-similarity call), autoInvokePlanSubAgents (L241, delegates to orchestrate(\'PLAN_PRD\',...) in scripts/orchestrate-phase-subagents.js -- confirmed via grep: that orchestrator has ZERO timeout/setTimeout/Promise.race anywhere, the single most likely hang candidate, matching the live specimen exactly). SURPRISING: this file ALSO already has a prior, different fix (L261-274, QF-20260424-805) -- flushAndExit()+resolveExitCode() solving the same heartbeat/socket-keepalive class as sd-start.js\'s fix, and with the identical limitation (only helps once addPRDToDatabase()\'s own promise resolves).',
    ],
    critical_issues: [
      'Existing try/catch wrapping in lead-final-approval/index.js (~20 sites) and the two prior partial fixes in sd-start.js/add-prd-to-database.js create a false impression of coverage -- none of them bound a HANG (an unresolved promise), only a THROW or a resolved-but-slow completion. This is the root reason the defect recurred across 5 separate specimens despite multiple independent prior remediation attempts.',
    ],
    warnings: [
      'Scope is larger than either original QF text suggests: lead-final-approval/index.js alone has 5 confirmed zero-protection sites (not 3 as a first manual read found) plus ~20 throw-only-protected sites that remain hang-vulnerable. sd-start.js and add-prd-to-database.js each have unrelated PRIOR fixes for a different-but-similarly-named failure mode, which must not be confused with this fix or assumed to already cover it.',
    ],
    recommendations: [
      'Fix shape for THIS SD, first pass: wrap the 3 bare steps in sd-creation.js (smallest, cleanest, matches the QF\'s literal "second" named script) and the 5 confirmed-bare steps in lead-final-approval/index.js (matches the QF\'s literal "third" named script, covering every site with ZERO current protection) with runPostWriteStage, mirroring the exact established pattern in scripts/modules/complete-quick-fix/orchestrator.js. Add unit tests per wrapped site using an injected never-resolving promise (safe diagnostic substitute for "reproducing the hang on a fixture SD" -- no need to force a live hang).',
      'Explicitly defer to a follow-up: (a) retrofitting timeout-bounds onto the ~20 already-try/caught-but-not-timeout-bound sites in lead-final-approval/index.js -- a much larger, separate hardening pass; (b) sd-start.js and add-prd-to-database.js wiring (the 2 addendum scripts) -- each has its own unrelated prior fix to account for and its own largest-risk step (orchestrate-phase-subagents.js for add-prd-to-database.js) that deserves its own scoped look; (c) the idempotent re-run guard (FIX SHAPE item b) -- a distinct behavioral change with real edge cases per script, same reasoning the QF-20260912-697 predecessor already used to defer it once.',
    ],
    detailed_analysis: 'Full investigation report (4 scripts, exact file:line evidence per post-write step, already-wrapped vs bare classification) persisted verbatim in metadata.explore_report below.',
    metadata: {
      explore_report: 'See teammate investigation for SD-LEO-FIX-POST-WRITE-HANG-001, read-only, no files edited. Covers all 4 scripts named across the QF\'s original text + 2 addenda, with per-step line numbers and try/catch classification as summarized in findings[] above.',
      scripts_investigated: [
        'scripts/modules/handoff/executors/lead-final-approval/index.js',
        'scripts/modules/learning/index.js',
        'scripts/modules/learning/sd-creation.js',
        'scripts/sd-start.js',
        'scripts/add-prd-to-database.js',
      ],
    },
  };

  const repoVerdict = await resolveSubAgentRepo({ sdId: sd.id, subAgentCode: 'EXPLORE', fallback: 'EHG_Engineer' });
  applySubAgentRepoVerdict(results, repoVerdict);
  const merged = await storeSubAgentResults('EXPLORE', sd.id, { name: 'Explore' }, results, { phase: 'LEAD', source: 'manual', sdKey });
  console.log('Stored:', merged?.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e); process.exit(1); });
}
