#!/usr/bin/env node
/**
 * VALIDATION sub-agent evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-010, LEAD_TO_PLAN phase.
 *
 * READ PROVENANCE: all greps/reads taken from the SD's own worktree
 * C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-010
 * on branch feat/SD-LEARN-FIX-ADDRESS-PAT-LES-010. The regression-guard test change is an
 * UNCOMMITTED working-tree modification at read time (git status " M"), so reading the
 * shared root or origin/main would NOT have seen it.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-010';

const findings = [
  {
    id: 'original-fragile-shape-confirmed-absent-from-live-code',
    severity: 'INFO',
    summary:
      "LEAD'S PRIMARY CLAIM INDEPENDENTLY CONFIRMED. Repo-wide grep for `stage22Data.promotion_gate` over *.js/*.ts/*.mjs/*.cjs (node_modules excluded) returns ZERO live-code hits. The only three occurrences are non-code: the new guard test's own assertion/comment (tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js:310), and prose inside LEAD's own scope-update script scripts/one-off/update-scope-pat-les-010.mjs. Separately, `stage22Data` (bare) appears in docs/archived/orphan-stage-23-modules/{stage-23-deployment,stage-23-release-readiness,stage-24-launch-execution}.js -- these are ARCHIVED orphan modules under docs/, imported by nothing, and are the retired pre-renumber lineage the pattern describes. The described defect has no live code path.",
  },
  {
    id: 'evaluateKillGate-still-live-elsewhere-but-not-in-the-23-24-path',
    severity: 'INFO',
    summary:
      "NUANCE THE GREP ALONE WOULD MISREAD: `evaluateKillGate(` IS still present in live code -- lib/eva/stage-templates/stage-03.js:182, stage-05.js:220, stage-13.js:139 (definitions + self-calls), their three analysis-steps call sites, and lib/agents/modules/venture-state-machine/stage-gates.js:143/219. None of these is a defect and none is in the stage-23/24 launch-readiness path. Critically, every live call uses a DESTRUCTURED OBJECT param (e.g. `evaluateKillGate({ overallScore, metrics: metricsMap })`), not the fragile `evaluateKillGate(..., stage22Data)` POSITIONAL boolean shape the pattern describes. So the pattern's specific fragility is genuinely gone, and the guard's scoping of its `evaluateKillGate(` assertion to only the four stage-23/24 source files is CORRECT -- a repo-wide assertion on that string would have been a false positive against three healthy stages.",
  },
  {
    id: 'current-mechanism-verified-artifact-existence-not-boolean-flag',
    severity: 'INFO',
    summary:
      "The replacement mechanism LEAD describes is verified present and is materially more robust. lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js declares UPSTREAM_REQUIREMENTS at :96 and preflightUpstream() at :149, invoked at :330. The test asserts (and passes) that UPSTREAM_REQUIREMENTS has exactly 3 entries for stages 20/21/22, each carrying an `anyOf` alternatives array. This checks canonical venture_artifacts rows by artifact_type with is_current=true -- an existence predicate over rows, never a raw boolean flag -- so the truthy-non-boolean coercion hazard the pattern described is structurally impossible in the current design, not merely absent. Renumber confirmed: stage-24.js:20 imports analyzeStage23LaunchReadiness from analysis-steps/stage-23-launch-readiness.js; stage-23.js:18 imports analyzeStage23DedicatedVentureUat.",
  },
  {
    id: 'regression-guard-test-exists-with-both-assertions-and-passes',
    severity: 'INFO',
    summary:
      "CLAIM 3 CONFIRMED BY EXECUTION, not by reading. The test `never reintroduces the pre-renumber stage22Data.promotion_gate.pass positional-param check (regression guard)` exists at tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js:310. It contains BOTH described assertions -- expect(source).not.toMatch(/stage22Data\\.promotion_gate/) AND expect(source).not.toMatch(/evaluateKillGate\\s*\\(/) -- looped over four hardcoded source paths: stage-23.js, stage-24.js, analysis-steps/stage-23-launch-readiness.js, analysis-steps/stage-23-dedicated-venture-uat.js. Ran `npx vitest run` on the file from the worktree: 1 file passed, 17/17 tests passed, 2.14s. The guard carries an accurate 9-line provenance comment naming PAT-LES-a7862f7339c4, SD-EVA-FIX-KILL-GATES-001 and the renumber.",
  },
  {
    id: 'no-duplicate-or-overlapping-sd',
    severity: 'INFO',
    summary:
      "GATE 1 DUPLICATE CHECK CLEAN. Swept strategic_directives_v2 on 10 terms (launch-readiness, launch readiness, stage-23, stage 23, stage-24, promotion_gate, KILL-GATES, PAT-LES-a7862f7339c4, PAT-LES-010, LEARN-FIX) across sd_key/title/description. SD-LEARN-FIX-ADDRESS-PAT-LES-010 is the ONLY SD keyed to this pattern. Both superseding SDs LEAD names are terminal: SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 (completed) and SD-EVA-FIX-KILL-GATES-001 (completed, the pattern's first_seen_sd_id). Of 9 non-terminal SDs on adjacent ground, none overlaps: 6 are unrelated /learn sibling patterns (PAT-LES-012/013, PATTERN-LEARN-151/152/153), 1 is SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-B (primary audience of record), 1 is the active SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001 orchestrator, and 1 is the target itself. No duplicate work, no scope collision.",
  },
  {
    id: 'guard-is-a-literal-string-check-not-a-behavioural-one',
    severity: 'MEDIUM',
    summary:
      "GENUINE LIMITATION PLAN SHOULD STATE PLAINLY. The guard is a source-TEXT check over two literal regexes. It would NOT catch a semantically equivalent reintroduction under any other spelling -- e.g. `s22.promotion_gate?.pass !== true`, `upstream.promotionGate.pass === true`, or a destructured `const { promotion_gate } = stage22; if (!promotion_gate.pass)`. It guards ONE historical string shape, not the CLASS of boolean-coercion fragility. That is a reasonable and proportionate scope for a regression guard against a named historical defect, but the PRD/retro must not describe it as preventing truthy-coercion bugs generally. The real structural protection is preflightUpstream's artifact-existence model (finding 3); the guard's job is only to stop a regression BACK to the retired shape.",
  },
  {
    id: 'guard-path-list-omits-stage-24-go-live-verified-benign',
    severity: 'LOW',
    summary:
      "Checked whether the guard's four-path list has a hole. lib/eva/stage-templates/analysis-steps/stage-24-go-live.js is NOT in the list AND does take a `stage22Data` param (line 60). Verified benign on two counts: (a) despite its filename it is the STAGE 25 analysis step -- only lib/eva/stage-templates/stage-25.js:11 imports it (plus the barrel at analysis-steps/index.js:60,142), so it is outside the stage-23/24 surface the guard defines; (b) its stage22Data use is distribution_channel_config fan-in (lines 80-89), never promotion_gate, and carries its own comment explaining a prior zero-channels defect. The guard's list is exactly the modules stage-23.js and stage-24.js actually import, which is the right boundary. Flagging only because the SD scope text says 'their analysis-step modules', which a future reader could read as including the stage-24-named file.",
  },
  {
    id: 'hardcoded-paths-fail-loud-on-a-future-renumber',
    severity: 'LOW',
    summary:
      "POSITIVE PROPERTY WORTH PRESERVING. The guard uses readFileSync(resolve(REPO_ROOT, relPath)) over hardcoded paths, so if Launch Readiness is renumbered again -- which has already happened once, and is the precise reason this SD exists -- the test throws ENOENT and FAILS LOUDLY rather than silently passing over a file that moved. This is the correct fail-closed direction (contrast a glob, which would silently match zero files and go green). The residual risk is human: a future engineer hitting the ENOENT may delete the guard rather than update its paths. The existing 9-line provenance comment mitigates this and should be preserved verbatim through any path update.",
  },
  {
    id: 'implementation-performed-during-lead-phase-uncommitted',
    severity: 'LOW',
    summary:
      "PROCESS NOTE. The SD is status='draft', current_phase='LEAD', yet the deliverable already exists as an UNCOMMITTED working-tree modification (git status ' M' on the test file; its last commit cd3d2998 belongs to SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H, i.e. the file pre-exists and only the new `it()` block is this SD's). Writing the implementation during LEAD inverts the normal LEAD->PLAN->EXEC ordering. Not a blocker and not gaming -- the work is small, verified, and honestly described -- but PLAN should write the PRD to CAPTURE this already-delivered test as the deliverable (with its acceptance criterion = the 17/17 run) rather than re-specifying it as future work, otherwise EXEC has nothing to do and the phase reads as hollow.",
  },
  {
    id: 'sd-narrative-fields-honest-title-still-reads-as-a-live-defect',
    severity: 'LOW',
    summary:
      "ANTI-GAMING CHECK PASSED, WITH ONE RESIDUAL. Read description + scope directly from the DB: both are honestly rewritten. The description carries a dated 'LEAD Verification Against Current Main (2026-09-13)' section naming commit 7fe5370/PR #1279 and stating the function 'w[as] REMOVED by later, unrelated work'; scope says IN SCOPE = verify + add regression guard, OUT OF SCOPE = 'Re-implementing the original evaluateKillGate check (superseded, not needed)'. sd_type correctly remains 'infrastructure' -- LEAD heeded the handoff.js anti-gaming flag on the 'documentation' reclassification rather than working around it, which is the right response. RESIDUAL: the SD TITLE still reads 'Address PAT-LES-a7862f7339c4: Stage 23 prerequisite check depends on stage22Data.promotion', which describes a LIVE defect. Anyone scanning titles (or a future /learn dedupe) would conclude a live fragile check was fixed. Also cosmetic: metadata.key_changes is null despite the reported update.",
  },
  {
    id: 'issue-pattern-row-still-assigned-and-will-re-trigger',
    severity: 'MEDIUM',
    summary:
      "ACTIONABLE LOOSE END. issue_patterns row PAT-LES-a7862f7339c4 is status='assigned', occurrence_count=1, first_seen_sd_id='SD-EVA-FIX-KILL-GATES-001', with an EMPTY summary field (the descriptive text lives only in the SD, not the pattern row). If this SD completes without transitioning the pattern to resolved/closed WITH a superseded note, /learn retains an open assigned pattern describing code that does not exist -- the exact condition that minted this SD -- and can regenerate an equivalent SD later. The close-out note should name the superseding SDs (SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001, SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001) and the guard test path, so the next reader does not have to re-derive the archaeology this SD just did.",
  },
];

const warnings = [
  "The pattern row PAT-LES-a7862f7339c4 has an EMPTY summary column -- its description survives only inside this SD's own text. Any future reader querying issue_patterns directly sees an assigned, occurrence_count=1 pattern with no description. Close-out must write the note INTO the pattern row, not only into the SD or the retro.",
  "Do not let the completion narrative claim this SD 'fixed a Stage 23 boolean-coercion bug'. It did not -- the bug was already gone before this SD existed. The honest claim is: verified-absent + permanent regression guard added. A retro or title that overstates this would make a future dedupe pass treat a live-fixed defect as precedent.",
  "The guard asserts over four hardcoded paths. Any future stage renumber (a recurring event in this area -- it is what produced this pattern) will break it with ENOENT. The correct response is to UPDATE the paths, never to delete the test; the provenance comment above the assertion exists to make that obvious and should survive edits.",
];

const recommendations = [
  "COMPLETE, do not cancel. The resolution is sound and non-gaming: the described code is verifiably absent (two independent greps plus an Explore pass plus this one), the deliverable is real executable CI-resident code rather than a doc edit, sd_type was correctly left 'infrastructure' after the anti-gaming guard flagged the 'documentation' reclassification, and the description/scope state the supersession plainly. Cancelling would discard a guard in a code area whose own churn history (one renumber already) is the reason the pattern is worth guarding.",
  "As a completion condition, transition issue_patterns PAT-LES-a7862f7339c4 to resolved/closed and POPULATE its empty summary with a superseded note naming SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001, SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 and tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js. Without this the pattern stays 'assigned' against non-existent code and /learn can re-mint an equivalent SD.",
  "Retitle the SD (or prepend 'SUPERSEDED --') so the title stops asserting a live defect. Current title reads 'Stage 23 prerequisite check depends on stage22Data.promotion', which contradicts the body's own verified finding that the code was removed. Title is what dedupe passes and humans scan.",
  "PLAN should write the PRD to CAPTURE the already-written guard as the deliverable, with acceptance criteria = (a) the named `it()` block present with both assertions, (b) `npx vitest run tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js` green at 17/17, (c) pattern row closed. Re-specifying it as future work would leave EXEC hollow, since the change already exists uncommitted in the worktree.",
  "State the guard's scope honestly in the PRD: it blocks reintroduction of ONE literal historical shape, not the class of truthy/boolean-coercion bugs. The structural protection is preflightUpstream's artifact-existence model. Overstating the guard invites a later reader to trust it against a renamed-variable reintroduction it cannot see.",
];

const summary =
  "VALIDATION for SD-LEARN-FIX-ADDRESS-PAT-LES-010 at LEAD_TO_PLAN: LEAD'S CLAIMS CONFIRMED, NO DUPLICATE, RESOLUTION IS SOUND AND NON-GAMING. (1) Independently verified the described code is absent: repo-wide grep for `stage22Data.promotion_gate` yields zero live-code hits (only the guard's own assertion and LEAD's scope script); the surviving `stage22Data` files are archived orphan modules under docs/ imported by nothing. (2) Recorded the nuance a naive grep would misread -- `evaluateKillGate(` IS still live at stages 03/05/13 and venture-state-machine, but every live call uses a destructured object param, never the fragile positional stage22Data boolean shape, so the guard's deliberate scoping to four stage-23/24 files is correct rather than a hole. (3) Confirmed the replacement mechanism: preflightUpstream() (:149) over UPSTREAM_REQUIREMENTS (:96, 3 entries S20/S21/S22 with anyOf) checks venture_artifacts rows by artifact_type/is_current -- an existence predicate, making the coercion hazard structurally impossible, not merely absent. (4) Verified the guard BY EXECUTION: the named `it()` exists at line 310 with both described assertions over four paths; npx vitest run gives 17/17 passing. (5) Duplicate check clean -- 10-term sweep of strategic_directives_v2 finds this is the only SD keyed to the pattern, both superseding SDs are completed, and all 9 non-terminal neighbours are unrelated. Verdict is CONDITIONAL_PASS, not PASS, on three non-blocking conditions, none of which is a duplicate or a gaming concern: the issue_patterns row remains status='assigned' with an EMPTY summary and will let /learn re-mint this SD unless closed with a superseded note; the SD TITLE still asserts a live defect that its own body disproves; and the guard is a literal-string check that cannot see a renamed-variable reintroduction, so the PRD must not overstate it. Also noted: the deliverable already exists as an uncommitted working-tree change written during LEAD, so PLAN should capture it rather than re-specify it.";

const conditions = [
  "Close issue_patterns PAT-LES-a7862f7339c4 (currently status='assigned', occurrence_count=1, summary EMPTY) to resolved with a superseded note naming SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001, SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 and the guard test path -- otherwise /learn can re-mint an equivalent SD against code that does not exist.",
  "Correct the SD title, which still reads 'Stage 23 prerequisite check depends on stage22Data.promotion' and asserts a live defect the SD's own verified body disproves.",
  "PRD must (a) capture the already-written guard as the deliverable with the 17/17 vitest run as its acceptance criterion rather than re-specifying it as future work, and (b) state the guard's scope honestly as one literal historical shape, not the class of boolean-coercion fragility.",
];

const justification =
  "CONDITIONAL_PASS rather than PASS. Every primary validation question came back clean and independently verified -- the described defect is absent from live code, the superseding mechanism is present and structurally stronger, the regression-guard test exists with both claimed assertions and passes 17/17 on execution, and there is no duplicate or overlapping SD. The resolution is explicitly judged non-gaming: real CI-resident executable code, sd_type correctly left 'infrastructure' after the anti-gaming guard flagged the 'documentation' reclassification, and honest description/scope. The conditions are withheld-approval items rather than failures: an issue_patterns row left status='assigned' with an empty summary is a live re-trigger path that would regenerate this same SD; a title that asserts a defect the body disproves will mislead dedupe passes and humans; and a literal-string guard described as broader than it is would be trusted against reintroductions it cannot detect. None blocks the LEAD->PLAN handoff; all three should be discharged before completion.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 93,
    findings,
    warnings,
    recommendations,
    conditions,
    justification,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_check_result: 'NO_DUPLICATE_FOUND',
      lead_claims_verified: {
        'described code absent from live codebase': 'CONFIRMED',
        'superseded by renumber + preflightUpstream rewrite': 'CONFIRMED',
        'regression guard test exists with both assertions': 'CONFIRMED',
        'test passes': 'CONFIRMED BY EXECUTION (17/17)',
        'sd_type correctly left infrastructure': 'CONFIRMED',
      },
      read_provenance: {
        codebase_read_from:
          'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-010',
        branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-010',
        note: 'Guard test change is an UNCOMMITTED working-tree modification (git status " M"); reading the shared root or origin/main would NOT have seen it.',
      },
      searches_run: [
        'grep -rn "stage22Data.promotion_gate" over *.js/*.ts/*.mjs/*.cjs excluding node_modules -> 0 live-code hits',
        'grep -rln "stage22Data" -> 14 files, all archived/orphan, tests, or unrelated (stage-24-go-live distribution fan-in)',
        'grep -rn "evaluateKillGate(" -> live at stage-03/05/13 + venture-state-machine, all destructured-object params, none in 23/24 path',
        'grep -rn "promotion_gate" lib/ -> artifact-types, autonomy-model, stage-contracts, worker enrichment; no fragile boolean gate',
        'import-graph check: which templates import stage-23-*/stage-24-* analysis steps',
        'strategic_directives_v2 10-term sweep on sd_key/title/description',
        'issue_patterns lookup by pattern_id + promotion_gate/Stage 23 summary sweep',
        'npx vitest run on the guard test file (executed, not read)',
      ],
      test_execution: {
        command:
          'npx vitest run tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js',
        result: '1 file passed, 17/17 tests passed, 2.14s',
        guard_test_name:
          'never reintroduces the pre-renumber stage22Data.promotion_gate.pass positional-param check (regression guard)',
        guard_location:
          'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js:310',
        guard_covered_paths: [
          'lib/eva/stage-templates/stage-23.js',
          'lib/eva/stage-templates/stage-24.js',
          'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
          'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js',
        ],
      },
      current_mechanism: {
        module: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
        upstream_requirements_line: 96,
        preflight_upstream_line: 149,
        invoked_line: 330,
        model: 'venture_artifacts existence by artifact_type with is_current=true (anyOf alternatives), never a raw boolean flag',
      },
      issue_pattern: {
        pattern_id: 'PAT-LES-a7862f7339c4',
        status: 'assigned',
        occurrence_count: 1,
        first_seen_sd_id: 'SD-EVA-FIX-KILL-GATES-001',
        summary_field: 'EMPTY',
        action_required: 'close with superseded note at SD completion',
      },
      gaming_assessment: 'NON_GAMING',
      recommended_disposition: 'COMPLETE (not cancel), subject to the three conditions',
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'VALIDATION' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('VALIDATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
