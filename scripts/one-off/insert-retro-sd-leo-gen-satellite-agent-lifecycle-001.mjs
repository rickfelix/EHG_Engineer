#!/usr/bin/env node
/**
 * One-off: SD_COMPLETION retrospective for
 * SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001 (uuid d61d96a1-bcf3-479a-9941-c1e348622b35)
 *
 * Satellite: agent-lifecycle -- ghost-CEO detection gauge + CEO-authority-gate
 * retirement (phase b, resized per RETIRE verdict).
 *
 * Required to unblock PLAN-TO-LEAD (RETROSPECTIVE_QUALITY_GATE_FAILED): the only
 * prior retro row for this SD is retro_type='HANDOFF' (LEAD_TO_PLAN), which the
 * gate's getFilteredRetrospective() correctly excludes (retro_type must be
 * SD_COMPLETION). This inserts the missing SD-completion retro with genuinely
 * SD-specific content (not boilerplate/metric-only).
 *
 * Inserts as DRAFT so the auto_validate_retrospective_quality trigger can
 * recompute quality_score from content, then promotes to PUBLISHED if >= 70.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createSupabaseServiceClient();
const SD_UUID = 'd61d96a1-bcf3-479a-9941-c1e348622b35';

const what_went_well = [
  "Phase-(a) reachability audit (docs/audits/venture-ceo-factory-reachability-verdict.json, verdict=RETIRE) proved BEFORE any new code was written that the intended target integration point -- commitStageTransition() in lib/agents/venture-state-machine.js and verifyCeoAuthority() in lib/agents/modules/venture-state-machine/handoff-operations.js -- has zero live production callers, since the real stage-advancement path calls a bare advanceStage() directly, bypassing the CEO-authority-gated path entirely.",
  "PLAN correctly descoped the PRD from 'build new venture-CEO agent-lifecycle infrastructure' (operating-company-satellite-architecture-v1.md section 3.6) down to 3 tightly-scoped FRs, rather than force-fitting the original architecture onto a confirmed-dead integration point -- recorded as metadata.descoped_from_original=true in .prd-payloads/SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001.json.",
  "lib/agents/ghost-ceo-gauge.js implements checkGhostCeos(supabase, opts) following the project's gauge/anti-fabrication convention: flags agent_registry rows with agent_type='venture_ceo' and status='active' but no independent liveness evidence, and exports NO_DATA_MARKER so zero rows renders an explicit no-data signal instead of a fabricated all-clear.",
  "RETIREMENT NOTE comments (zero behavior change) were added to both dead-path functions naming this SD, the audit verdict file, and the successor/BUILD-ON path -- mirroring the precedent pattern from SD-LEO-INFRA-RETIRE-DEAD-MONITORING-CHAIN-001 (lib/eva/stage-zero/data-pollers/index.js) instead of inventing a new documentation convention.",
  "10 tests in tests/unit/agents/ghost-ceo-gauge.test.js prove honesty/NO-DATA-marker behavior, anti-fabrication, a false-positive guard, the gauge's read-only guarantee, and retention of venture-ceo-factory.js's chairman-ratified exports (STANDARD_VENTURE_TEMPLATE with VP_CUSTOMER/Sales_Crew/VP_MARKETING, EHG_SHARED_OPERATORS with 4 shared operators).",
  "All 3 FRs were validated PASS by 4 sub-agents (TESTING, UAT, VALIDATION, REGRESSION) with distinct evidence rows in sub_agent_execution_results, and the change shipped as a single commit (ff9fe3ef00f) touching 4 files and changing 203 lines net (+203/-1)."
];

const key_learnings = [
  "When a phase-(a) reachability audit returns verdict=RETIRE for an SD's target integration point (here: commitStageTransition/verifyCeoAuthority, zero live production callers), PLAN should descope-and-flag the PRD rather than build new lifecycle infrastructure atop confirmed-dead code -- a reusable pattern for any future satellite-architecture SD whose PRD assumes a specific call path exists.",
  "The project's gauge/anti-fabrication convention (a gauge must never fabricate an all-clear from a weak status-only proxy; zero rows renders an explicit NO_DATA_MARKER, never silence-as-success) was the correct minimal-footprint substitute for the originally-scoped full lifecycle infrastructure -- lib/agents/ghost-ceo-gauge.js's checkGhostCeos() is the concrete implementation.",
  "RETIREMENT NOTE comments (no behavior change) are a low-risk way to formally record a dead-path finding directly in the code, naming the SD, the audit verdict file, and the successor path -- this SD reused the precedent from SD-LEO-INFRA-RETIRE-DEAD-MONITORING-CHAIN-001 rather than inventing a new convention.",
  "The root vitest.config.js's **/.worktrees/** exclusion is a project-wide harness gap, not specific to this SD: any SD executed from a worktree checkout needs a temporary, untracked, ad-hoc vitest config just to make tests discoverable at all, and it should be fixed once centrally rather than worked around per-SD.",
  "When pre-existing test failures sit adjacent to an SD's edit surface, a git stash / git stash pop before-and-after comparison is the rigorous way to prove non-regression -- assuming 'comment-only changes can't break tests' without running that comparison would have been an unverified claim.",
  "Cross-SD conflicts over whether a subsystem should be retired or revived (here: a sibling chairman-ratified SD may expect the CEO-authority-gated commit path to be revived rather than retired) should be flagged to the coordinator for adjudication rather than resolved unilaterally by PLAN -- descope-and-flag is the correct posture when a PRD's scope decision could contradict another SD's intent."
];

const what_needs_improvement = [
  "A harness limitation was discovered: the root vitest.config.js excludes **/.worktrees/** entirely, which blocks vitest test discovery/execution whenever cwd is inside a worktree checkout -- required a temporary untracked ad-hoc vitest config as a workaround on every test run in this SD, never committed, and logged as harness-backlog feedback rather than fixed here (out of scope for this SD).",
  "4-6 pre-existing test failures were found in tests/unit/agents/venture-state-machine-jit-check.test.js, unrelated to this SD's comment-only edits; confirming non-regression required a git stash / git stash pop before-and-after comparison rather than a quick visual diff, and the harness currently has no baseline-failure ledger to make that comparison instant.",
  "A cross-SD conflict was surfaced but deliberately not resolved unilaterally: another chairman-ratified sibling SD may expect the CEO-authority-gated commit path (commitStageTransition/verifyCeoAuthority) to be revived rather than retired -- PLAN's role here was descope-and-flag to the coordinator, leaving the conflict open for chairman/coordinator adjudication before any SD attempts to build atop or resurrect that path."
];

const action_items = [
  { text: "File/track a harness-backlog fix for vitest.config.js's **/.worktrees/** exclusion so tests are discoverable when cwd is a worktree checkout (affects every SD run from a worktree, not just SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001).", category: 'TESTING_STRATEGY' },
  { text: "Escalate the CEO-authority-gate retirement-vs-revival conflict (this SD's RETIREMENT NOTE comments vs. a sibling chairman-ratified SD's apparent expectation that commitStageTransition/verifyCeoAuthority be revived) to the chairman/coordinator for adjudication before any SD attempts to build atop or resurrect that path.", category: 'PROCESS_IMPROVEMENT' },
  { text: "Track the 4-6 pre-existing failures in tests/unit/agents/venture-state-machine-jit-check.test.js as a standalone harness-backlog item, separate from SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001, so they are not mistaken for a regression on the next SD touching this file.", category: 'TESTING_STRATEGY' },
  { text: "Apply this SD's descope-and-flag pattern (gauge + retirement-note comments, no new infra atop a RETIRE-verdict path) to any future phase of operating-company-satellite-architecture-v1.md section 3.6+ whose phase-(a) reachability audit also returns verdict=RETIRE.", category: 'PROCESS_IMPROVEMENT' }
];

const retro = {
  sd_id: SD_UUID,
  target_application: 'EHG_Engineer',
  project_name: 'Satellite: agent-lifecycle -- ghost-CEO detection gauge + CEO-authority-gate retirement (phase b, resized per RETIRE verdict)',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: 'SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001 Retrospective',
  description: "Retrospective for the descoped Satellite 3.6 agent-lifecycle build (phase b): a phase-(a) reachability audit found the CEO-authority-gated commit path (commitStageTransition / verifyCeoAuthority) has zero live production callers, so PLAN descoped the PRD from 'build new venture-CEO lifecycle infrastructure' to 3 FRs -- a read-only ghost-CEO gauge, retirement-note comments on the dead path, and a 10-test suite -- rather than building new capability atop confirmed-dead code.",
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['TESTING', 'UAT', 'VALIDATION', 'REGRESSION'],
  human_participants: ['LEAD'],

  what_went_well,
  key_learnings,
  action_items,
  what_needs_improvement,

  learning_category: 'APPLICATION_ISSUE',
  affected_components: [
    'Agent Lifecycle',
    'Ghost-CEO Gauge',
    'Venture State Machine',
    'CEO Authority Gate'
  ],
  related_files: [
    'lib/agents/ghost-ceo-gauge.js',
    'lib/agents/venture-state-machine.js',
    'lib/agents/modules/venture-state-machine/handoff-operations.js',
    'tests/unit/agents/ghost-ceo-gauge.test.js'
  ],
  related_commits: ['ff9fe3ef00f'],
  related_prs: [],
  tags: ['SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001', 'satellite-agent-lifecycle', 'descope', 'retirement-note', 'ghost-ceo-gauge', 'reachability-audit', 'anti-fabrication'],

  quality_score: 85, // seed; trigger recomputes from content

  team_satisfaction: 8,
  business_value_delivered: 'Prevented wasted engineering effort by refusing to build new venture-CEO lifecycle infrastructure atop a confirmed-dead integration point (zero live callers verified via phase-a reachability audit); delivered a minimal-footprint anti-fabrication gauge instead.',
  customer_impact: "Internal/process -- no direct end-user-facing change; protects against future dead-code amplification in the venture-CEO lifecycle subsystem.",
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 0,
  bugs_resolved: 0,
  tests_added: 10,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  success_patterns: [
    'Reachability-audit-before-build gate prevented new lifecycle infra from being built atop a confirmed-dead CEO-authority path',
    "Descope-and-flag posture correctly separated PLAN's scope-reduction authority from cross-SD conflict adjudication (routed to coordinator, not resolved unilaterally)",
    'Gauge/anti-fabrication convention reused rather than reinvented for a new NO_DATA_MARKER gauge'
  ],
  failure_patterns: [
    "No automated cross-SD conflict detection surfaced the sibling SD's apparent revival intent for the CEO-authority path -- discovered only via manual PLAN review of the audit"
  ],
  improvement_areas: [
    {
      area: "Vitest cannot execute from a worktree cwd due to the **/.worktrees/** exclusion in root vitest.config.js",
      analysis: "The exclusion was added to stop CI from double-running tests across parallel-session worktrees, but it has the side effect of blocking ALL test execution (not just double-counting) whenever cwd IS inside a worktree -- an over-broad blanket exclusion rather than a CI-scoped one.",
      prevention: "Scope the exclusion to CI-only contexts (e.g. via an env-var check) or ship a documented worktree-safe vitest config that test runners auto-detect, rather than requiring each SD to hand-roll an untracked ad-hoc config."
    },
    {
      area: "Pre-existing test failures adjacent to comment-only edits created regression-verification overhead",
      analysis: "tests/unit/agents/venture-state-machine-jit-check.test.js has 4-6 failing tests that predate this SD and are unrelated to the RETIREMENT NOTE comments added here, but distinguishing pre-existing vs. newly-introduced failures required a manual git stash / git stash pop comparison since the harness has no baseline-failure ledger.",
      prevention: "Maintain a known-failing-tests baseline (e.g. a JSON manifest of currently-failing test IDs) so PLAN/EXEC can diff against it instantly instead of re-deriving via stash/pop on every touching SD."
    },
    {
      area: "Cross-SD intent conflict on the CEO-authority-gated commit path (retire vs. revive) was discovered only during PLAN's phase-a audit review",
      analysis: "The venture-ceo-factory.js chairman-ratified exports and the CEO-authority-gated commit path both live in the same lifecycle subsystem, but a sibling SD's apparent revival intent was not visible from this SD's PRD or scope alone -- cross-SD dependency signals on a shared subsystem aren't currently surfaced automatically.",
      prevention: "Add a lightweight cross-SD conflict check at PLAN phase (e.g. grep sibling SDs referencing the same target files/functions) for any SD touching a shared subsystem that a reachability audit flags RETIRE."
    }
  ],
  generated_by: 'MANUAL',
  trigger_event: 'SD_STATUS_COMPLETED',

  status: 'DRAFT'
};

const { data: inserted, error: insertErr } = await supabase
  .from('retrospectives')
  .insert(retro)
  .select();

if (insertErr) {
  console.error('INSERT FAILED:', insertErr.message);
  process.exit(1);
}

const retroId = inserted[0].id;
let score = inserted[0].quality_score;
console.log('Inserted DRAFT retro id=%s quality_score=%s', retroId, score);
console.log('quality_issues=', JSON.stringify(inserted[0].quality_issues));

if (score >= 70) {
  const { data: pub, error: pubErr } = await supabase
    .from('retrospectives')
    .update({ status: 'PUBLISHED' })
    .eq('id', retroId)
    .select();
  if (pubErr) {
    console.error('PUBLISH FAILED:', pubErr.message, '- left as DRAFT');
  } else {
    console.log('Published. status=%s', pub[0].status);
  }
} else {
  console.log('Score below 70; left as DRAFT. quality_issues=', JSON.stringify(inserted[0].quality_issues));
}

// Read back the persisted, trigger-recomputed value
const { data: readback, error: rbErr } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .eq('id', retroId)
  .single();

if (rbErr) {
  console.error('READBACK FAILED:', rbErr.message);
  process.exit(1);
}
console.log('READBACK:', JSON.stringify(readback, null, 2));
