#!/usr/bin/env node
/**
 * One-off: INSERT the SD_COMPLETION retrospective row for
 * SD-LEO-INFRA-S20-26-SIMULATED-RUN-001.
 *
 * Context: the PLAN-TO-LEAD gate rejected an earlier auto-generated retro
 * for being metric-only boilerplate. This version writes the SD-specific
 * narrative: the kill_gate_mode-stamp PRD correction discovered mid-EXEC,
 * the containmentSweep RESIDUE acceptance-criterion correction, the
 * non-vacuous verification discipline applied to the new verify script,
 * and the worktree binary-mismatch environment issue.
 *
 * CRITICAL constraints (per LEO gate semantics + prior retro precedent,
 * see scripts/one-off/_insert-sdcompletion-retro.mjs):
 *  - retro_type          = 'SD_COMPLETION'
 *  - retrospective_type  = NULL (the LEAD-FINAL gate filter looks for
 *    retro_type='SD_COMPLETION' AND retrospective_type IS NULL; the
 *    existing LEAD_TO_PLAN handoff retro already owns retrospective_type)
 *  - created_at          = now() (must be AFTER the accepted LEAD-TO-PLAN
 *    handoff @ 2026-08-17T01:38:22.281685Z)
 *
 * Note: an auto_validate_retrospective_quality trigger may recompute
 * quality_score on insert; we set an honest value and re-read the stored
 * row to report the final score.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

(function loadEnvFromAncestors() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) { dotenv.config({ path: envFile }); return; }
    dir = path.dirname(dir);
  }
})();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '9dc54aa6-c52a-48f9-bbc7-3497c7d4448f';
const SD_KEY = 'SD-LEO-INFRA-S20-26-SIMULATED-RUN-001';
const nowIso = new Date().toISOString();

const what_went_well = [
  'The harness itself worked exactly as its own §H7 doc predicted: a real, fail-closed exit gate ("no verifier registered for a BINDING gate") blocked stage traversal and was journaled as an observation rather than aborting the run — the pre-built safety fence performed as designed on first execution.',
  'The documented H5.1 Stripe spawn-env fence (assertSpawnEnvStripeFence, s20-run.mjs:128) correctly forced the invoking process to clear STRIPE_SECRET_KEY before the run, since the shared .env carries a LIVE-mode key — this is the fence doing its job, not friction to route around.',
  'Non-vacuous verification discipline was applied deliberately, not just claimed: after writing checkStageZeroNonInterference, it was stubbed to always return pass:true, the 2 tests expected to catch that regression were confirmed RED, then the real implementation was restored and 16/16 confirmed green again.',
  'When the PRD assumption about kill_gate_mode being stamped in the harness run journal proved false against the real system_events data, the fix was scoped correctly: independently resolve and durably record the value via a companion verification artifact rather than modifying out-of-scope harness code.',
  'Scope discipline held under two separate mid-EXEC surprises (the missing kill_gate_mode stamp and the expected containmentSweep RESIDUE findings) — both times the PRD was corrected to match measured reality instead of forcing the implementation to match a wrong PRD guess.'
];

const what_needs_improvement = [
  'The PLAN-time PRD assumed, without ever running the harness, that kill_gate_mode=standard would be literally stamped as text in the run journal. This was never verified against real harness telemetry before being written into an FR — it was corrected only after EXEC actually ran the harness and inspected the real finalize-mirror row (50 journal entries, no such stamp).',
  'A second PRD acceptance criterion ("containmentSweep records zero RESIDUE findings") was also written from assumption rather than measurement — containmentSweep runs mid-runArc before teardown, and teardown was correctly out of scope, so RESIDUE findings for the fixture venture are the expected steady state on every fresh run, not a defect to eliminate.',
  'This worktree\'s node_modules/@rolldown/binding-win32-x64-msvc binary was corrupted/mismatched (17.5MB vs the shared root\'s working 24.3MB copy), causing vitest to fail to start (ERR_DLOPEN_FAILED) even after a fresh npm install via sd-start.js\'s coordinated install-lock path; only copying the shared root\'s known-good binary in resolved it, and the root cause of why the worktree install produced a bad binary was not identified.'
];

const key_learnings = [
  'PRD assumptions about a pre-built, already-safety-fenced harness\'s own runtime output (e.g. "does the journal stamp X") must be verified against a real run before being written as an FR/acceptance-criterion — writing them from the harness spec/design doc without executing the harness first produces plausible-sounding but false claims about its telemetry shape.',
  'When a PRD assumption is falsified by measured behavior and the harness/gate/stage code is explicitly out of scope (per the SD\'s own DOES-NOT), the correct move is to relocate the missing capability into the new artifact this SD IS scoped to build (here: the verification script independently resolving kill_gate_mode via get_chairman_settings() RPC and durably recording it in a companion system_events row) — not to either modify out-of-scope code or leave the success criterion unsatisfiable.',
  'containmentSweep firing RESIDUE findings mid-run (before teardown) is expected harness behavior whenever teardown is intentionally out of scope for the calling SD; treating "residue exists" as a defect conflates a mid-run intermediate state with the harness\'s actual post-teardown contract.',
  'Non-vacuous verification (stub the check, confirm the intended tests go red, restore, confirm green) is worth doing explicitly on new verification scripts, not just asserted — it is the only way to know the tests are actually coupled to the specific failure mode they claim to catch, versus merely coupled to the check function existing.',
  'A worktree-specific node_modules binary mismatch (native addon architecture/size mismatch) can survive npm install and require copying a known-good binary from the shared root — flagged as a possible recurring worktree-install reliability gap rather than fixed at the source, since root cause (why this worktree\'s install path produced a bad binary while the shared root\'s did not) was not established from a single occurrence.'
];

const action_items = [
  {
    text: 'Consider updating docs/design/s20-26-simulated-run-harness-spec.md to note that kill_gate_mode is NOT durably stamped in the run journal itself (the companion verify-s20-run.mjs system_events row is the durable record) — informational doc correction, not a code change; out of this SD\'s scope to make.',
    category: 'DOCUMENTATION'
  },
  {
    text: 'If the worktree node_modules/@rolldown/binding-win32-x64-msvc mismatch recurs on another worktree, log a harness_backlog feedback entry (node scripts/log-harness-bug.js) — one occurrence is not enough to justify an SD, but a second would establish a pattern worth investigating in sd-start.js\'s install-lock path.',
    category: 'INFRASTRUCTURE'
  },
  {
    text: 'Post-run grading of the s2026-hotel-0817 fixture (system_events finalize-mirror row + the new harness_run_verification companion row) is explicitly owned by a separate downstream consumer — this SD only produced the durable record for grading to consume.',
    category: 'PROCESS'
  }
];

const success_patterns = [
  'Run the real system first, then write acceptance criteria from measured output — not the reverse.',
  'When out-of-scope code would need to change to satisfy a PRD assumption, relocate the missing capability into the in-scope artifact instead.',
  'Stub-and-confirm-red before trusting a new verification check\'s coupling to the failure it claims to catch.',
  'Respect a pre-built safety fence (Stripe spawn-env, fail-closed exit gates) as working-as-designed rather than as an obstacle.'
];

const failure_patterns = [
  'PLAN-time PRD FR written from the harness design doc\'s description of its own behavior, never verified by actually running the harness, produced a false "kill_gate_mode is stamped in the journal" assumption.',
  'A second acceptance criterion (containmentSweep zero RESIDUE) was likewise written from assumption about a component\'s expected end-state without accounting for the mid-run vs post-teardown distinction.',
  'Worktree npm install produced a corrupted/mismatched native binary (@rolldown/binding-win32-x64-msvc) that a fresh install did not self-heal.'
];

const detailed_summary =
  'SD-LEO-INFRA-S20-26-SIMULATED-RUN-001 executed the pre-built, already safety-fenced S20-26 simulated-run harness ' +
  '(scripts/harness/s20-run.mjs) at its documented defaults — simulated mode, kill_gate_mode=standard resolved ' +
  'automatically (chairman_settings has zero live rows), real-gates advance policy, fresh run-id s2026-hotel-0817 — ' +
  'and durably recorded the result for separately-owned post-run grading. The run (STRIPE_SECRET_KEY cleared per the ' +
  'harness\'s own H5.1 assertSpawnEnvStripeFence, since the shared .env carries a live-mode key) completed exit 0, ' +
  'traversing all 7 stages 20-26, each correctly blocked by a real fail-closed exit gate and journaled as an ' +
  'observation per the harness\'s own §H7 design, never aborting. The core EXEC deliverable is ' +
  'scripts/harness/verify-s20-run.mjs (202 LOC, new) plus tests/unit/harness/verify-s20-run.test.js (151 LOC, 16 ' +
  'tests) — a read-only post-run verification script with 5 checks: finalize-mirror row exists exactly once, ' +
  'telemetry recorded per traversed stage, the Stripe spawn-env fence held, synthetic-fixture/is_demo convention ' +
  'observed, and zero Stage-Zero-namespace tables touched (non-interference proxy for normal Stage-0 ordering). ' +
  'A key mid-EXEC correction: the PLAN-time PRD assumed the harness journal would literally stamp ' +
  '"kill_gate_mode=standard" as text; inspecting the real system_events finalize-mirror row (50 entries) showed no ' +
  'such stamp exists anywhere in the harness\'s own telemetry. Rather than modify out-of-scope harness code, the ' +
  'verify script independently resolves kill_gate_mode via the get_chairman_settings() Postgres RPC for the fixture ' +
  'venture (confirmed \'standard\', source=system_default) and durably records that resolution plus all 5 check ' +
  'results as a companion system_events row (event_type=harness_run_verification, addressable by run_id) — the ' +
  'actual artifact satisfying the SD\'s success criterion; PRD FR-2 was updated post-implementation to match. A ' +
  'second mid-EXEC discovery: containmentSweep (called inside runArc, before teardown) always reports RESIDUE ' +
  'findings for the fixture venture on every fresh run since teardown was correctly out of scope (fixture rows must ' +
  'persist for downstream grading) — an initial "zero RESIDUE findings" acceptance criterion draft was corrected ' +
  'before being acted on. Non-vacuous verification discipline was applied to the new check functions: ' +
  'checkStageZeroNonInterference was deliberately stubbed to always pass, confirmed exactly the 2 coupled tests went ' +
  'red, then restored with 16/16 green. PR #7166 (rickfelix/EHG_Engineer, +353/-0, two new files) opened with no ' +
  'harness/gate/stage-definition files touched, matching the SD\'s explicit DOES-NOT. Separately, this worktree\'s ' +
  '@rolldown/binding-win32-x64-msvc native binary was corrupted/mismatched (17.5MB vs the shared root\'s working ' +
  '24.3MB), blocking vitest from starting until the shared root\'s binary was copied in manually; root cause not ' +
  'identified from this single occurrence.';

const row = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null, // CRITICAL: NULL so the LEAD-FINAL gate filter recognizes this as the completion retro
  title: 'SD Completion Retrospective: S20-26 Simulated-Run Harness Execution & Post-Run Verification',
  description: detailed_summary,
  conducted_date: nowIso,
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['RETRO'],
  human_participants: [],
  what_went_well,
  what_needs_improvement,
  action_items,
  key_learnings,
  success_patterns,
  failure_patterns,
  improvement_areas: [
    'Verify harness/component telemetry shape by running it before writing PRD acceptance criteria that assume its output format.',
    'Distinguish mid-run intermediate states (e.g. pre-teardown containmentSweep residue) from a component\'s actual post-completion contract when writing acceptance criteria.',
    'Worktree npm-install native-binary reliability (rolldown binding mismatch) — monitor for recurrence.'
  ],
  quality_score: 85,
  technical_debt_addressed: false,
  technical_debt_created: false,
  bugs_found: 0,
  bugs_resolved: 0,
  tests_added: 16,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  generated_by: 'MANUAL',
  auto_generated: false,
  status: 'PUBLISHED',
  quality_validated_by: 'RETRO',
  target_application: 'EHG_Engineer',
  learning_category: 'PROCESS_IMPROVEMENT',
  applies_to_all_apps: false,
  related_commits: ['00d4b5c353f'],
  affected_components: [
    'scripts/harness/verify-s20-run.mjs',
    'tests/unit/harness/verify-s20-run.test.js',
    'scripts/harness/s20-run.mjs (read-only execution, not modified)',
    'get_chairman_settings() Postgres RPC',
    'system_events (harness_run_verification companion row)'
  ],
  test_total_count: 16,
  test_passed_count: 16,
  test_failed_count: 0,
  test_skipped_count: 0,
  tags: ['s20-26-harness', 'simulated-run', 'post-run-verification', 'prd-correction', 'kill-gate-mode', 'non-vacuous-verification'],
  protocol_improvements: [
    'PRD FRs describing a pre-built component\'s runtime telemetry output should be written (or re-verified) after an actual run of that component, not solely from its design/spec doc.'
  ],
  unnecessary_work_identified: [],
  future_enhancements: [
    'Downstream post-run grading of the s2026-hotel-0817 fixture (separately owned) can now consume the durable kill_gate_mode resolution + 5 check results from the harness_run_verification system_events row.'
  ],
  metadata: {
    sd_key: SD_KEY,
    written_by: 'continuous-improvement-coach-sub-agent',
    run_id: 's2026-hotel-0817',
    pr_number: 7166,
    pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/7166',
    stages_traversed: '20-26 (7 stages)',
    harness_exit_code: 0,
    kill_gate_mode_resolved: 'standard',
    kill_gate_mode_source: 'system_default (get_chairman_settings RPC, zero live chairman_settings rows)',
    prd_correction_1: 'FR-2: kill_gate_mode is not stamped in harness journal text; resolved+recorded independently by verify-s20-run.mjs instead',
    prd_correction_2: 'acceptance criterion draft "containmentSweep records zero RESIDUE findings" corrected — RESIDUE is expected pre-teardown steady state, teardown is out of scope',
    non_vacuous_verification: 'checkStageZeroNonInterference stubbed pass:true; confirmed 2 coupled tests went red; restored; 16/16 green',
    worktree_env_issue: '@rolldown/binding-win32-x64-msvc corrupted/mismatched (17.5MB vs 24.3MB shared-root working copy); npm install did not self-heal; manual binary copy resolved it; root cause not identified'
  },
  created_at: nowIso,
  updated_at: nowIso
};

const { data, error } = await supabase
  .from('retrospectives')
  .insert(row)
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .single();

if (error) {
  console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}

// Re-read to capture any trigger-recomputed quality_score / status
const { data: stored } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .eq('id', data.id)
  .single();

console.log('RETROSPECTIVE_ROW ' + data.id);
console.log('STORED_AFTER_TRIGGERS ' + JSON.stringify(stored));
