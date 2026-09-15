#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001,
 * LEAD-TO-PLAN phase.
 *
 * Investigated the SD's premise (no eva_architecture_plans/eva_vision_documents column can
 * record a distinct content author or a distinct non-chairman approver) against current
 * main: confirmed TRUE, with a significant refinement -- the SD's cited "hardcoded
 * chairman_approved true" sub-claim (lib/eva/archplan-upsert.js:121-122) is STALE; the
 * function already branches on a real `approved` parameter exercised by live callers. The
 * genuinely unaddressed gap is narrower and better-evidenced than the SD's own text: a
 * prior SD (SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001) already built a same-party-refusal
 * guard (lib/eva/archplan-promote.js, citing ratification a588adba) but its own docblock
 * admits it is a placeholder pending a deferred `approved_by` column (FR-6, not
 * implemented), and it has ZERO production callers.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001';

const findings = [
  {
    id: 'core-claim-true-no-distinct-approver-field',
    severity: 'INFO',
    summary: 'Confirmed via live schema query: neither eva_architecture_plans nor eva_vision_documents has any column besides created_by/chairman_approved/chairman_approved_at for authorship/approval identity. chairman_approved is boolean-only -- no caller anywhere passes a real approver-seat identity into it. created_by in real call sites is always a process/tool label (eva-archplan-command, brainstorm-to-vision-pipeline, eva-vision-command), never a person/seat, confirmed against the live created_by distribution (203/247 arch-plan rows = eva-archplan-command; 206/347 vision rows = eva-vision-command).',
  },
  {
    id: 'hardcoded-chairman-approved-true-subclaim-is-stale',
    severity: 'INFO',
    summary: 'lib/eva/archplan-upsert.js:15 accepts approved=true as a DEFAULT parameter, not a hardcoded literal; :125 computes isApproved = approved !== false, then branches status/chairman_approved/chairman_approved_at on it (:135-136). Real callers DO pass approved:false: scripts/cron/cascade-watcher.mjs:215, lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js:391,411. The CLI (scripts/eva/archplan-command.mjs:228-230, via archplan-approval-choice.mjs) makes --approved/--draft a MANDATORY explicit choice, no silent default at that entry point. lib/eva/vision-upsert.js has the identical real-branching pattern (approved/chairmanRatified params, :63,:102-104), also exercised by real approved:false callers (lib/eva/vision-repair-loop.js:313, stage-17-doc-generation.js:289, scripts/eva/brainstorm-to-vision.mjs:266). The SD text\'s specific "hardcoded" characterization of lines 121-122 does not match current main.',
  },
  {
    id: 'dead-code-partial-solution-already-anticipates-this-fix',
    severity: 'HIGH',
    summary: 'lib/eva/archplan-promote.js (promoteArchPlan(), added under SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 FR-5) is a genuine non-creation approval workflow that already refuses self-approval (promotedBy === row.created_by, :86-89, explicitly citing ratification a588adba) -- but its own docblock (:26-32) calls this a "provenance PLACEHOLDER, not a strong identity check" since ~79% of rows share the created_by label \'eva-archplan-command\', and states real enforcement needs a "deferred approved_by column (FR-6, not implemented)". Critically, promotedBy is NEVER WRITTEN to the row -- only used for the guard and a log line; the UPDATE (:91-97) touches only status/chairman_approved/chairman_approved_at. Per this repo\'s own committed security review (scripts/one-off/archplan-exec-to-plan-security-evidence.mjs), promoteArchPlan has ZERO production callers -- the dominant live path (~85% of rows, archplan-command.mjs upsert --approved) reaches active/chairman_approved=true via upsertArchPlan\'s onConflict upsert with NO self-approval guard at all, and OVERWRITES created_by in the process.',
  },
  {
    id: 'vision-side-approval-actively-destroys-author-provenance',
    severity: 'HIGH',
    summary: 'scripts/modules/stage-execution/stage-execution-worker.js:4015-4018 (_autoApproveCloneVision) is a real, live "approval distinct from creation" action for eva_vision_documents, but it OVERWRITES created_by: \'testing-agent-clone-autoapprove\' on approval, destroying the original author label rather than recording a distinct approver. This is a live, currently-occurring data-loss pattern on the author-provenance field this SD exists to protect.',
  },
];

const warnings = [
  'The SD\'s own cited file:line evidence (archplan-upsert.js:121-122, "hardcoded") is stale relative to current main -- PLAN should not scope EXEC around removing a hardcode that does not exist. The genuinely load-bearing, better-evidenced gap is: (1) no approved_by/approved_at column exists anywhere, (2) the one prior same-party-refusal guard that exists (archplan-promote.js) is dead code with zero callers and cannot persist its own guard\'s result, (3) the live approval path for vision documents actively destroys author provenance on approval.',
];

const recommendations = [
  'PLAN should scope the schema change around the gap archplan-promote.js\'s own docblock already named: an approved_by column (plus approved_by_at, since chairman_approved_at exists as precedent) on eva_architecture_plans, and the equivalent addition to eva_vision_documents.',
  'PLAN should wire promoteArchPlan() as the actual live approval entry point (it currently has zero production callers) rather than inventing a parallel mechanism, extending its existing same-party-refusal guard to also WRITE approved_by/approved_by_at to the row.',
  'PLAN must fix _autoApproveCloneVision (stage-execution-worker.js:4015) to stop overwriting created_by on approval -- this is a live, currently-occurring provenance-destroying bug independent of the new column addition.',
  'PLAN should NOT modify upsertArchPlan()/upsertVision()\'s existing approved/chairmanRatified branching logic -- it is real, tested, and working; the gap is purely the missing distinct-approver-identity column and its (currently dead) guard code, not the approval-state branching itself.',
  'This SD requires new columns on 2 existing tables -- expect the same chairman-gated-migration / R1 ceremony pattern as SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 earlier this session.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001 confirmed the SD\'s core claim (no way to record a distinct content author or non-chairman approver identity on a governance artifact) is TRUE against current main, while refuting its specific "hardcoded chairman_approved true" sub-claim as stale (the function genuinely branches and is exercised both ways by live callers). Found a materially better foundation than the SD text describes: a prior SD already built a same-party-refusal guard (archplan-promote.js, citing the same ratification a588adba) whose own docblock explicitly anticipates the deferred approved_by column this SD should add -- but that guard is dead code with zero production callers and never persists its own result. Also found a live, currently-occurring provenance-destroying bug on the vision side (_autoApproveCloneVision overwrites created_by on approval) that this SD\'s fix should also close.';

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
    confidence_score: 94,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/eva/archplan-upsert.js',
        'lib/eva/vision-upsert.js',
        'lib/eva/archplan-promote.js',
        'scripts/eva/archplan-command.mjs',
        'scripts/cron/cascade-watcher.mjs',
        'lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js',
        'lib/eva/vision-repair-loop.js',
        'scripts/eva/brainstorm-to-vision.mjs',
        'scripts/modules/stage-execution/stage-execution-worker.js',
        'scripts/one-off/archplan-exec-to-plan-security-evidence.mjs',
      ],
      probe_method: 'Live schema query (SELECT * LIMIT 1 on both tables) plus a live created_by value-distribution query across all rows, cross-referenced against source-code call-site tracing.',
      corroborated_by: 'Explore agent (Task-tool run, LEAD-phase) independently traced all call sites and cited the identical file:line evidence.',
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
