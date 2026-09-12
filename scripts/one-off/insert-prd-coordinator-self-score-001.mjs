#!/usr/bin/env node
/**
 * One-off: insert the inline PRD for SD-LEO-FIX-COORDINATOR-SELF-SCORE-001.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-COORDINATOR-SELF-SCORE-001';

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) {
    console.error('SD_FETCH_FAILED', sdErr);
    process.exit(1);
  }

  const prd = {
    id: `PRD-${SD_KEY}`,
    directive_id: sd.id,
    title: sd.title,
    status: 'draft',
    category: 'technical',
    priority: 'low',
    version: '1.0',
    phase: 'planning',
    created_by: 'PLAN',
    executive_summary: "Wire the missing --force override into coordinator-self-review.mjs's self-score writer (mirroring Adam/Solomon's existing pattern) and enable the 2 tri-party self-score-age gauges whose writers are independently verified live. Adds a durable lint preventing this exact failure class (an enabled gauge with a demonstrably silent writer) from recurring.",
    business_context: "Sourced from Solomon's Friday Foundation Audit #2 item 6 (feedback 89b3be6a). Adam disposition: a gauge with no writer is not a gauge -- either the writer ships and the gauge flips on in the same change, or the gauge is deleted with a note; never left enabled:false as an indefinite unexplained promise.",
    technical_context: "lib/governance/gauge-registry.js registers 3 self-score-age gauges (adam/coordinator/solomon), all shipped enabled:false. Live measurement: adam_self_assessment has 174 feedback rows (most recent within hours), solomon_self_assessment has 84 (most recent within hours), coordinator_self_assessment has 0 rows, ever. Root cause for the coordinator: COORD_SELF_SCORE_V1 (gating the write in scripts/coordinator-self-review.mjs) is set nowhere in machine/user env, .env, or CI, and unlike Adam/Solomon's parallel flags, this writer shipped with no --force CLI bypass to override it. Escalated from QF-20260911-404 after the actual fix measured 113 net source LOC, over the 75-LOC quick-fix cap.",
    system_architecture: "gauge-runner.mjs's staleSelfScoreDetector(category, cadenceHours=48) reads the most recent feedback row per category and trips if none exists or it's older than 48h. Each writer (adam-self-assessment-writer.cjs, solomon-self-assessment-writer.cjs, coordinator-self-review.mjs) independently gates its own write behind a role-specific env flag, defaulting OFF (ships-inert convention). Adam and Solomon's writers additionally accept a --force CLI flag that bypasses their flag check; their own cron prompts (adam-startup-check.mjs) explicitly invoke --force under a chairman-directed override. coordinator-self-review.mjs's write is additionally behind a single-writer mutation guard (guardMutation/resolveOwnSessionId) restricting it to the live coordinator session.",
    implementation_approach: "1) Add a --force flag to coordinator-self-review.mjs bypassing COORD_SELF_SCORE_V1, mirroring Adam/Solomon exactly. 2) Wire --force into coordinator-startup-check.mjs's self-review cron prompt. 3) Flip adam_self_score_age and solomon_self_score_age to enabled:true in gauge-registry.js (writers verified live). 4) Leave coordinator_self_score_age enabled:false -- the writer fix ships here, but activation requires the coordinator role to re-arm its own cron and produce a first row (a worker/QF seat cannot and should not bypass the mutation guard to manufacture one). 5) Add scripts/lint/self-score-gauge-writer-lint.mjs: fails loud if any ENABLED self-score-age gauge's writer has gone silent >30d. 6) Fix the line-drift this edit introduces in lib/coordinator/insert-coordination-row-callers.cjs's pinned-line census (2 call sites shift +6 lines each).",
    content: "# PRD: Wire the coordinator self-score writer's --force bypass, enable adam/solomon gauges\n\nSee executive_summary/technical_context/implementation_approach fields for full detail. Escalated from QF-20260911-404; code changes already implemented, tested (172 targeted + 50,721 full-suite tests green, 3 pre-existing unrelated failures excluded -- missing vitest.mjs binary in this worktree for 2 subprocess-spawning tests, 1 known-flaky timeout), and pushed to branch feat/SD-LEO-FIX-COORDINATOR-SELF-SCORE-001 / PR #8739 before this PRD was authored, per the QF-to-SD escalation workflow (LOC-cap escalation, not a scope change).",
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: "Add a --force CLI bypass to coordinator-self-review.mjs's self-score gate",
        description: "coordinator-self-review.mjs accepts --force, which bypasses the COORD_SELF_SCORE_V1==='on' check, mirroring scripts/adam-self-assessment-writer.cjs and scripts/solomon-self-assessment-writer.cjs's identical existing pattern exactly.",
        priority: 'required',
        acceptance_criteria: [
          "node scripts/coordinator-self-review.mjs --force reaches the self-score write branch even when COORD_SELF_SCORE_V1 is unset",
          'Without --force and without the env var set, behavior is unchanged (still ships inert)',
        ],
      },
      {
        id: 'FR-2',
        requirement: "Wire --force into the coordinator's self-review cron manifest",
        description: "coordinator-startup-check.mjs's 'self-review' cron entry's prompt invokes coordinator-self-review.mjs --force, so once the coordinator role re-arms this cron the writer actually reaches the write branch on its normal DUE-branch cadence.",
        priority: 'required',
        acceptance_criteria: [
          "coordinator-startup-check.mjs's self-review cron prompt string contains '--force'",
        ],
      },
      {
        id: 'FR-3',
        requirement: 'Enable the 2 self-score-age gauges with independently-verified live writers',
        description: 'adam_self_score_age and solomon_self_score_age flip to enabled:true in gauge-registry.js. coordinator_self_score_age stays enabled:false pending the coordinator role producing a first live row (mutation-guard-protected write; out of worker/QF authority to manufacture).',
        priority: 'required',
        acceptance_criteria: [
          "GAUGE_REGISTRY.find(e => e.id==='adam_self_score_age').enabled === true",
          "GAUGE_REGISTRY.find(e => e.id==='solomon_self_score_age').enabled === true",
          "GAUGE_REGISTRY.find(e => e.id==='coordinator_self_score_age').enabled === false",
        ],
      },
      {
        id: 'FR-4',
        requirement: 'Add a durable writer-liveness lint for the self-score-age gauge family',
        description: 'scripts/lint/self-score-gauge-writer-lint.mjs exits 1 if any ENABLED self-score-age gauge\'s corresponding feedback category has no row within 30 days, preventing this exact failure class (an enabled gauge with a silent writer) from recurring.',
        priority: 'required',
        acceptance_criteria: [
          'Lint passes at the shipped state (adam/solomon enabled+fresh, coordinator disabled)',
          'Lint fails if coordinator_self_score_age is hypothetically flipped enabled:true while its writer still has 0 rows (verified during implementation)',
        ],
      },
      {
        id: 'FR-5',
        requirement: 'Fix the census line-drift this change introduces',
        description: "The --force flag's declaration in coordinator-self-review.mjs shifts 2 pre-existing insertCoordinationRow() call sites by +6 lines each; lib/coordinator/insert-coordination-row-callers.cjs's pinned-line census entries for both are updated to match.",
        priority: 'required',
        acceptance_criteria: [
          'tests/unit/coordinator/insert-coordination-row-callers-census.test.js passes',
        ],
      },
    ],
    acceptance_criteria: [
      "grep for 'COORD_SELF_SCORE_V1' in scripts/coordinator-self-review.mjs shows the check also accepts a --force override",
      "coordinator-startup-check.mjs's self-review cron prompt contains '--force'",
      "GAUGE_REGISTRY entries for adam_self_score_age and solomon_self_score_age have enabled:true; coordinator_self_score_age has enabled:false",
      'node scripts/lint/self-score-gauge-writer-lint.mjs exits 0 at the shipped state',
      'tests/unit/coordinator/insert-coordination-row-callers-census.test.js passes',
    ],
    test_scenarios: [
      { id: 'TS-1', scenario: '--force bypasses COORD_SELF_SCORE_V1', expected: 'coordinator-self-review.mjs reaches the self-score write branch when invoked with --force even though COORD_SELF_SCORE_V1 is unset' },
      { id: 'TS-2', scenario: 'gauge-registry flags reflect verified writer liveness', expected: 'adam/solomon self-score-age gauges enabled:true, coordinator stays enabled:false' },
      { id: 'TS-3', scenario: 'new lint fails on a silent enabled writer', expected: 'self-score-gauge-writer-lint.mjs exits 1 if coordinator_self_score_age is hypothetically flipped enabled:true with 0 rows (verified during implementation, then reverted)' },
      { id: 'TS-4', scenario: 'census line-drift caught and fixed', expected: 'insert-coordination-row-callers-census.test.js passes after updating the 2 shifted pinned lines' },
    ],
    non_functional_requirements: [
      { id: 'NFR-1', requirement: 'No regression', description: 'Full unit sweep remains green apart from pre-existing, independently-confirmed-unrelated failures.', priority: 'required' },
    ],
    exec_checklist: [
      'Implement --force flag in coordinator-self-review.mjs',
      'Wire --force into coordinator-startup-check.mjs cron prompt',
      'Flip adam_self_score_age and solomon_self_score_age to enabled:true',
      'Leave coordinator_self_score_age enabled:false with explanatory registry comment',
      'Add scripts/lint/self-score-gauge-writer-lint.mjs',
      'Fix insert-coordination-row-callers.cjs census line-drift',
      'Update tests/unit/governance/gauge-registry.test.js for the 2 flipped flags',
      'Run targeted + full unit sweep',
    ],
    risks: [
      {
        risk: 'A future edit to coordinator-self-review.mjs shifts the insertCoordinationRow census lines again',
        probability: 'medium',
        impact: 'low (caught by the census test itself, as it was here)',
        mitigation: 'Census test already caught this once during implementation; no further mitigation needed beyond the existing test.',
      },
      {
        risk: 'coordinator_self_score_age is flipped enabled:true by a future change before its writer has actually produced a live row',
        probability: 'low',
        impact: 'medium (gauge trips permanently, exactly the failure class this SD fixes)',
        mitigation: 'scripts/lint/self-score-gauge-writer-lint.mjs fails loud in exactly this scenario, verified probative during implementation.',
      },
    ],
  };

  const { error: insErr } = await supabase.from('product_requirements_v2').insert(prd);
  if (insErr) {
    console.error('PRD_INSERT_FAILED', insErr);
    process.exit(1);
  }
  console.log('PRD inserted:', prd.id);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
