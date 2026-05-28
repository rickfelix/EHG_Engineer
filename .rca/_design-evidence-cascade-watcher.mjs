import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const evidence = {
  verdict: 'CONDITIONAL_PASS',
  attack_1_idempotency_concurrent: {
    finding: 'Option C is structurally safe under concurrent chairman + cron edits, with one residual race.',
    safe_layers: [
      'upsertArchPlan uses ON CONFLICT plan_key + version bump (last writer wins, no partial corruption)',
      'create-orchestrator-from-plan.js L259-274 does sd_key pre-check + same-vision/arch guard, then resume-not-insert',
      'create-orchestrator-from-plan.js L351-361 child phases skipped when covered_by_sd_key already exists',
      'archplan-upsert L82-87 sections object is fully rebuilt each run (no stale fragment merge)',
    ],
    residual_race: 'Between L260 pre-check and L328 INSERT the orchestrator key is not locked. If chairman manually triggers create-orchestrator while watcher is mid-flight, both can pass the pre-check and one INSERT loses on the sd_key unique constraint. The losing run exits non-zero but only AFTER score-at-conception side-effects ran on the winning row. Recommendation: wrap orchestrator insert in a single upsert-with-on-conflict-do-nothing, OR have the watcher take a PG advisory lock on hash(vision_key||arch_key) before invoking the library.',
    mid_edit_chairman_scenario: 'Chairman editing CronGenius L2 vision concurrently is SAFE. The watcher signal is status=active AND chairman_approved=true AND venture_id NOT NULL. Drafts in mid-edit do not match. The only narrow risk is the watcher firing in the 60s window AFTER chairman flips chairman_approved=true but BEFORE the final sections settle. This is a chairman-workflow concern, not a design defect. Mitigation: chairman flips chairman_approved=true LAST.',
  },
  attack_2_observability: {
    finding: 'FR-C dashboard surface is INSUFFICIENT as sole observability channel. Refusals need a push signal, not just a poll-on-demand table.',
    rationale: 'eva_cascade_errors only helps if chairman remembers to check it. The refusal-gate precedent at lifecycle-sd-bridge.js:213 throws ServiceError with the exact remediation command embedded (/brainstorm --seed-from=draft_seed --venture <name>). The cron watcher cannot throw to a human, so by the time the chairman checks, debugging is archaeology.',
    required_additions: [
      'Heartbeat row in claude_sessions (or a dedicated cascade_watcher_heartbeat table) with last_run_at + last_refusal_count so /leo next can surface "cascade watcher refused 3 ventures in last cycle"',
      'EACH refusal row in eva_cascade_errors MUST carry a remediation_command column with the literal command string (mirror the lifecycle-sd-bridge pattern) so dashboard rendering is parseable, not free-text',
      'Daily summary: a once-a-day refusal_count > 0 summary surfaced via the existing harness-backlog feedback channel (log-harness-bug.js category) so it reaches the coordinator inbox',
    ],
    severity: 'must-decide-before-PRD',
  },
  attack_3_f3_f5_inline_scope: {
    finding: 'IN-SCOPE is defensible. F3 (no eva_arch_plans table) and F5 (10-canonical-section quality trigger) are load-bearing for cascade quality.',
    reasoning: 'The cron watcher will be the second-ever caller of the venture-aware path. If it produces arch_plans that fail the quality trigger or that reference a non-existent table, the cascade silently produces orchestrators with broken back-references, repeating the false-positive pattern of the CronGenius score 63155810 invalidation. Unit cost of fixing F3/F5 inside this SD is low; cost of shipping cascade without them is a fresh round of false-data invalidations.',
    boundary_condition: 'If F3/F5 turn out to require migrations >50 LOC each, split them. Otherwise keep inline. PLAN should do a 30-minute LOC-sniff on F3/F5 before locking PRD scope.',
  },
  attack_4_library_boundary: {
    finding: 'Plan choice of SINGLE FAT FUNCTION (createOrchestratorFromPlan) is WRONG for testability. Recommend the three-function split.',
    reasoning: [
      'createOrchestratorFromPlan reads two tables (vision + arch_plan), generates metrics, inserts the orchestrator, inserts N children, links covered_by_sd_key back, AND scores at conception (5 distinct testable units crammed into one function, mirroring the existing main() at L162-507 which is 345 LOC of CLI ceremony)',
      'The refusal-gate precedent assertVentureVisionReady is a 55-LOC single-responsibility function. That is the model to mirror, not main().',
      'Split rationale: buildOrchestratorSD(visionDoc, archPlan, phases, metrics) -> object | error (pure, fully unit-testable); buildChildSD(orchSD, phase, dimensionMap) -> object (pure, exercises the non-vertical detector); insertCascade(supabase, orchSD, childSDs) -> { error, inserted, skipped } (the only function that touches DB; mockable via test supabase)',
      'Fat-function variant forces every test to either run a full integration with live DB OR mock all 5 sub-behaviours simultaneously',
    ],
    secondary_note: 'parsePhases is already exported and pure, keep it as the 4th building block. scoreSDAtConception lives in leo-create-sd.js, leave it OUT of the library (caller composes it post-insert).',
  },
  attack_5_cron_registration_coupling: {
    finding: 'Coupling to "leo-cron-monitor" needs revision. The codebase has NO leo-cron-monitor daemon. Existing pattern is npm-script-style hosts under scripts/cron/ invoked by an external scheduler.',
    evidence: [
      'grep package.json: only scripts/cron/quality-findings-aggregator.mjs is registered as a cron-callable npm script (quality:aggregate:cron)',
      'No long-running cron supervisor process exists; nothing named leo-cron-monitor in scripts/ root',
      'scripts/archive/one-time/ contains historical watchers (leo-watcher.js, leo-ci-monitor.js) all archived = pattern was abandoned',
    ],
    recommendation: 'Adopt the EXISTING pattern: deliver scripts/cron/cascade-watcher.mjs as a stateless one-shot, registered in package.json as cascade:watch:cron, invoked by whatever external scheduler the operator runs (Windows Task Scheduler / cron / systemd timer). DO NOT introduce a new long-running daemon. The 60s interval is a recommendation in operator docs, not enforced in code.',
    why_one_shot_not_daemon: 'One-shot semantics survive crashes, are cleanly idempotent, are observable via exit code + log file, and require zero new lifecycle infra. A daemon requires PID file, restart-on-crash, log rotation, and graceful-shutdown handling, all out-of-scope for this SD.',
    severity: 'must-decide-before-PRD',
  },
  required_changes_before_prd: [
    'Add advisory-lock or transactional-upsert for orchestrator-insert race (Attack 1 residual)',
    'Mandate refusal-row remediation-command column + heartbeat row (Attack 2)',
    'Verify F3/F5 LOC budget; split if >50 LOC each (Attack 3 boundary)',
    'Switch plan from single-fat-function to 3-function split + parsePhases reuse (Attack 4)',
    'Confirm cron host: stateless one-shot under scripts/cron/ + package.json npm script, NOT a new daemon (Attack 5)',
  ],
  reused_proven_patterns: [
    'assertVentureVisionReady throw-with-remediation-command (lifecycle-sd-bridge.js:181-235) is the gold-standard refusal pattern. Cascade watcher should mirror, writing the equivalent string into eva_cascade_errors.remediation_command',
    'upsertArchPlan idempotent-on-plan_key (lib/eva/archplan-upsert.js:111) already library-grade, reusable as-is',
    'parsePhases pure helper (create-orchestrator-from-plan.js:110-151) already exported, reusable as-is',
  ],
  refute_or_defend_plan_claims: {
    plan_claim_single_fat_function: 'REFUTED. Split into 3 functions (Attack 4)',
    plan_claim_F3_F5_inline: 'DEFENDED with caveat. Verify LOC budget first (Attack 3)',
    plan_claim_dashboard_surface_sufficient: 'REFUTED. Push signal (heartbeat + remediation strings) required (Attack 2)',
    plan_claim_existing_leo_cron_monitor: 'REFUTED. No such daemon exists. Use one-shot npm script + external scheduler (Attack 5)',
    plan_claim_60s_polling: 'DEFENDED. 60s is fine for the L2-active-flip-to-cascade latency budget',
    plan_claim_naturally_worktree_safe: 'DEFENDED. All writes are DB-mediated (no file paths involved)',
    plan_claim_backward_compat_with_manual_cli: 'DEFENDED. CLI main() keeps working as a thin wrapper over the library',
  },
};

const justification = 'Architecture review of Option C (cron watcher) cascading L2 vision approval to archplan to orchestrator/children. CONDITIONAL_PASS: Option C is structurally sound - idempotency, refusal-gate symmetry, and naturally worktree-safe DB-only writes all hold up under attack. However, 5 conditions must be resolved BEFORE PLAN locks the PRD: (1) orchestrator-insert needs advisory lock or transactional upsert to close residual concurrent-cron-vs-chairman race; (2) refusals MUST embed remediation command strings AND emit a heartbeat row - dashboard-only surface is insufficient because chairman never sees passive table data; (3) F3/F5 are legitimately in-scope but PLAN must verify LOC budget before commitment; (4) library boundary MUST split into buildOrchestratorSD + buildChildSD + insertCascade (not a single fat function - existing main() at 345 LOC is the anti-pattern to avoid); (5) cron host MUST be a stateless one-shot under scripts/cron/ + npm-script registration, NOT a new leo-cron-monitor daemon (no such daemon exists in codebase; archived/leo-watcher.js was abandoned). All five attack vectors enumerated with evidence in detailed_analysis.';

const row = {
  sd_id: '74108dbf-766e-4f4c-958f-786ff1bc16fb',
  sub_agent_code: 'DESIGN',
  sub_agent_name: 'Senior Design Sub-Agent',
  phase: 'LEAD',
  verdict: evidence.verdict,
  confidence: 88,
  detailed_analysis: evidence,
  justification,
  summary: 'CONDITIONAL_PASS on Option C cron watcher. 5 pre-PRD changes required: orchestrator-insert advisory-lock, refusal remediation_command + heartbeat, F3/F5 LOC verification, 3-function library split, stateless one-shot cron host (no leo-cron-monitor daemon exists).',
  source: 'sub_agent',
  validation_mode: 'prospective',
  executed_from_cwd: process.cwd(),
  conditions: [
    { id: "C1", description: "Add advisory-lock or transactional-upsert for orchestrator-insert race (Attack 1 residual)", severity: "blocking", attack: "idempotency_concurrent" },
    { id: "C2", description: "Refusal-row remediation_command column + heartbeat row (Attack 2)", severity: "blocking", attack: "observability" },
    { id: "C3", description: "Verify F3/F5 LOC budget; split if >50 LOC each (Attack 3 boundary)", severity: "advisory", attack: "scope_boundary" },
    { id: "C4", description: "Switch plan from single-fat-function to 3-function split + parsePhases reuse (Attack 4)", severity: "blocking", attack: "library_boundary" },
    { id: "C5", description: "Confirm cron host: stateless one-shot under scripts/cron/ + npm script, NOT a new daemon (Attack 5)", severity: "blocking", attack: "cron_registration_coupling" }
  ],
  metadata: {
    review_type: 'option_C_cron_watcher_architecture',
    attack_vectors_evaluated: 5,
    must_decide_before_prd_count: 5,
    plan_claims_refuted: 3,
    plan_claims_defended: 4,
    invoked_by: 'manual_via_design_subagent_prompt',
    invoked_at: new Date().toISOString(),
    model: 'claude-opus-4-7[1m]',
  },
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, verdict, confidence, created_at, sub_agent_code, sub_agent_name, phase, sd_id')
  .single();

if (error) {
  console.error('INSERT FAILED:', error.message);
  console.error(JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('EVIDENCE_ROW_ID=' + data.id);
console.log('VERDICT=' + data.verdict);
console.log('CONFIDENCE=' + data.confidence);
console.log('SUB_AGENT_CODE=' + data.sub_agent_code);
console.log('PHASE=' + data.phase);
console.log('SD_ID=' + data.sd_id);
console.log('CREATED_AT=' + data.created_at);
