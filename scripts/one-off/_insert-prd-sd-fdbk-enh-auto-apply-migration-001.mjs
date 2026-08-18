#!/usr/bin/env node
/**
 * PRD insertion for SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001.
 * Follows the documented Claude-Code inline-mode PRD workflow (CLAUDE_PLAN.md
 * "PRD Creation — Inline Mode is the Default for Claude Code"): the prompt was
 * already printed by add-prd-to-database.js; this inserts the generated JSON.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001';

const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, title')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) { console.error('SD_FETCH_ERR:', sdErr.message); process.exit(1); }

const prd = {
  id: `PRD-${SD_KEY}`,
  directive_id: SD_KEY,
  sd_id: sd.id,
  title: 'Auto-Apply Migration Path: Loud Detection, Accountability Loop, Conformance Gauge, Staleness-Guard Fix',
  version: '1.0',
  status: 'approved',
  category: 'infrastructure',
  document_type: 'prd',
  priority: 'medium',
  goal_summary: 'Apply the witness migration, add an accountability loop + conformance gauge for RECENT drift-guard gaps, and fix the SD-creation staleness guard to use live-state proof instead of a commit-count heuristic.',
  executive_summary: 'Applies the confirmed-absent witness RPC live, adds an accountability loop and visibility gauge so drift-guard\'s loud CI failures reach an actionable ticket instead of only logs, and fixes the staleness guard that mistook file-edit commits for a live fix.',
  business_context: 'CRACK-GATE FR-1 currently no-ops gracefully because set_venture_pbn_verdict_stage_zero is absent live. Separately, migration-deploy-drift-guard.yml has been red on every push to main and its daily cron since at least 2026-08-17T13:42Z (14 RECENT / 131 LEGACY gaps, 145/149 undispositioned) with no mechanism turning that into an actionable ticket -- the backlog only grows.',
  technical_context: 'Three existing surfaces are load-bearing here: scripts/modules/handoff/pre-checks/pending-migrations-check.js (per-SD-handoff-scoped auto-apply, filename-to-sd_key match at checkSDPendingMigrations), .github/workflows/migration-deploy-drift-guard.yml (comprehensive post-merge + daily-cron verify-only detector calling scripts/verify-migration-apply-state.mjs --strict --recent-only), and lib/eva/premise-liveness.js (the SD-creation staleness/duplicate guard whose git-log-on-referenced-files branch at lines 188-198 sets found=true/fileMatch=true from commit COUNT alone, with no live-state check).',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Apply database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql to live via the existing 3-factor @approved-by chairman gate',
      description: 'Run node scripts/apply-migration.js database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql --prod-deploy (scripts/apply-migration.js:211 prodDeploy flag; scripts/lib/migration-guards.js:86 validateProdDeployGuards 3-factor check). This restores the RPC set_venture_pbn_verdict_stage_zero, unblocking CRACK-GATE FR-1.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: Direct RPC probe (supabase.rpc(\'set_venture_pbn_verdict_stage_zero\', {})) no longer returns PGRST202',
        'AC-2: migration-deploy-drift-guard.yml triggered via workflow_dispatch no longer lists set_venture_pbn_verdict_stage_zero in RECENT gaps',
        'AC-3: The 3-factor guard (flag + @approved-by header + single-use token) was exercised, not bypassed'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Detect a NEW RECENT gap by diffing the current verify-migration-apply-state.mjs --json output against the previously-recorded RECENT set',
      description: 'A gap is "new" when its filename is RECENT-classified this run and was not RECENT (or was absent) in the immediately-prior run\'s recorded state. Persist the prior-run RECENT filename set (e.g. a small JSON artifact or a table row) so the diff has a baseline to compare against, since docs/audits/migration-dispositions.json only tracks dispositioned (suppressed) files, not a run-history baseline.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: Given a first run with RECENT=[A,B] and a second run with RECENT=[A,B,C], the diff identifies exactly C as new',
        'AC-2: Given two consecutive runs with an identical RECENT set, the diff identifies zero new gaps',
        'AC-3: A file that was RECENT, then dispositioned (suppressed), then reappears as RECENT again is treated as new (dispositioning is not permanent immunity)'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Auto-file a feedback row referencing each newly-detected RECENT gap, deduplicated by filename',
      description: 'When FR-2 detects one or more new gaps, insert one feedback row per gap file (not per CI run) via the existing feedback pipeline, so a RECENT gap gets an actionable ticket instead of only a CI log line. A second detection of the SAME still-open gap file must not create a duplicate row.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: A new RECENT gap produces exactly one feedback row on first detection, queryable by filename in metadata',
        'AC-2: The same gap file detected again on a subsequent run (still open, not yet resolved) does not produce a second feedback row',
        'AC-3: The feedback row content names the specific missing schema object(s) (function/table/view/etc.), not just the filename'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Add a lightweight command/summary reporting the current RECENT-undispositioned gap count',
      description: 'A new npm script (or an addition to an existing status/summary command) that runs verify-migration-apply-state.mjs --json and reports: total RECENT gaps, RECENT gaps already dispositioned/suppressed, RECENT gaps undispositioned (the actionable backlog). Same visibility class as the existing chairman-gated CEREMONY_PENDING status, but for the auto (non-chairman-gated) path.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: Running the command reports a numeric undispositioned-RECENT-gap count matching a fresh verify-migration-apply-state.mjs --json run',
        'AC-2: The command exits 0 regardless of the count (informational, not a new blocking gate) -- it must not duplicate migration-deploy-drift-guard.yml\'s existing blocking behavior',
        'AC-3: Output distinguishes RECENT from LEGACY counts (LEGACY stays advisory-only per the existing gate contract)'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'lib/eva/premise-liveness.js\'s referenced-file git-log check must corroborate with a live-state signal before declaring a premise STALE, not rely on commit count alone',
      description: 'The block at lib/eva/premise-liveness.js:188-198 currently sets found=true and fileMatch=true purely from `git log --oneline --since=... -- <file>` returning any commits -- editing a migration file (e.g. touching a comment, or fixing an unrelated bug in the same file) is treated identically to actually applying/fixing the underlying defect. When the descriptor\'s referenced file is a database migration (path matches database/migrations/, database/manual-updates/, or supabase/migrations/), the check must additionally corroborate via a live-state probe (reuse probeDeclaredObjectsExist from scripts/modules/handoff/pre-checks/pending-migrations-check.js, or the migration-deploy-drift-guard verdict) before setting fileMatch=true for that file. If the live-state probe is unavailable (DB unreachable), fall back to the current commit-count evidence but flag it as unconfirmed in the returned evidence array, so a downstream --force-liveness override decision is made with that caveat visible.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: A migration file with 5 recent commits but an object still absent live (probeDeclaredObjectsExist returns executed=false) does NOT set fileMatch=true / status=STALE on that basis alone',
        'AC-2: A migration file with commits AND all declared objects present live (executed=true) sets fileMatch=true / status=STALE, corroborated',
        'AC-3: When the live-state probe is unreachable, the function still returns (fail-open preserved) but the evidence array explicitly states the corroboration was unavailable',
        'AC-4: Non-migration referenced files (no path match) are unaffected -- existing commit-count-only behavior preserved for them'
      ]
    },
    {
      id: 'FR-6',
      requirement: 'Regression test pinning the same-file-authoring-commits-without-live-fix scenario, plus a short doc note naming the guard-class confusion',
      description: 'Add a unit test for checkPremiseLiveness / the referenced-files branch covering: commits touching a migration file without the declared object existing live -> not STALE on file-match grounds alone. Add a short comment/doc note (in premise-liveness.js\'s docblock or a linked runbook) naming the anti-pattern: "editing a migration file is not evidence the migration was applied" -- for future creation-time guards operating on the same class of claim.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: New test file (or added cases in the existing premise-liveness test suite) covers the FR-5 AC-1/AC-2 scenarios with a mocked probeDeclaredObjectsExist',
        'AC-2: npm test -- premise-liveness exits 0 with the new cases passing',
        'AC-3: A named anti-pattern note exists in the codebase (docblock or docs/) describing the same-file-authoring-commits vs runner-defect confusion'
      ]
    }
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'FR-1 through FR-4 must not modify scripts/lib/migration-guards.js (the 3-factor @approved-by chairman gate)',
      rationale: 'That gate is explicitly out-of-scope and unchanged by design (per SD scope); FR-1 uses it as-is via apply-migration.js --prod-deploy.'
    },
    {
      id: 'TR-2',
      requirement: 'FR-2/FR-3\'s new-gap baseline persistence must not depend on migration-deploy-drift-guard.yml\'s GitHub Actions runner filesystem surviving between runs (each CI run starts from a fresh checkout)',
      rationale: 'The prior-run RECENT set must be durable across runs -- either a DB table row, a committed artifact, or reuse of an existing durable store (e.g. audit_log or a new small table) -- not a local temp file.'
    },
    {
      id: 'TR-3',
      requirement: 'FR-5\'s live-state corroboration call must reuse probeDeclaredObjectsExist (scripts/modules/handoff/pre-checks/pending-migrations-check.js) rather than re-implementing pg introspection',
      rationale: 'That function already handles the audit-log fast path, declared-object parsing, and pg client lifecycle correctly; duplicating it risks drift between the two call sites checking the same class of fact.'
    }
  ],
  system_architecture: {
    overview: 'FR-1 is a one-time manual-gate apply, not new architecture. FR-2/FR-3/FR-4 extend the existing migration-deploy-drift-guard.yml verify-only pipeline with a persistence + notification step, without changing its detection logic. FR-5/FR-6 extend lib/eva/premise-liveness.js with an additional corroboration branch scoped to migration-path referenced files.',
    components: [
      { name: 'Gap-history store', responsibility: 'Persists the RECENT gap filename set from the most recent run so FR-2 can diff against it', technology: 'Supabase table or audit_log row (JSONB)' },
      { name: 'New-gap notifier', responsibility: 'Compares current vs prior RECENT set, files one feedback row per newly-detected gap, deduped by filename', technology: 'Node script invoked from migration-deploy-drift-guard.yml' },
      { name: 'Conformance gauge command', responsibility: 'Reports current RECENT-undispositioned gap count on demand', technology: 'npm script wrapping verify-migration-apply-state.mjs --json' },
      { name: 'Premise-liveness live-state corroborator', responsibility: 'Adds a live-state check for migration-path referenced files before trusting commit-count evidence', technology: 'lib/eva/premise-liveness.js + reused probeDeclaredObjectsExist' }
    ],
    data_flow: 'migration-deploy-drift-guard.yml runs verify-migration-apply-state.mjs --json -> new-gap notifier diffs against the gap-history store -> new gaps produce feedback rows -> gap-history store updated with the current RECENT set for the next run. Separately, at SD-creation time, checkFeedbackPremiseLiveness -> checkPremiseLiveness -> (for migration-path files) probeDeclaredObjectsExist -> corroborated STALE/LIVE verdict.',
    integration_points: [
      'migration-deploy-drift-guard.yml (existing CI workflow, extended with a new step)',
      'feedback table (existing pipeline, FR-3 inserts rows)',
      'lib/eva/premise-liveness.js (existing SD-creation guard, FR-5 extends its referenced-files branch)',
      'scripts/modules/handoff/pre-checks/pending-migrations-check.js probeDeclaredObjectsExist (reused, not modified)'
    ]
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Apply the witness migration and confirm the RPC is live', test_type: 'integration', given: 'set_venture_pbn_verdict_stage_zero.sql is merged but the RPC returns PGRST202', when: 'node scripts/apply-migration.js <path> --prod-deploy is run with valid 3-factor guards', then: 'the RPC becomes callable and drift-guard workflow_dispatch no longer lists it as RECENT' },
    { id: 'TS-2', scenario: 'New RECENT gap triggers exactly one feedback row', test_type: 'integration', given: 'a fresh RECENT gap file not present in the prior recorded RECENT set', when: 'the new-gap notifier step runs', then: 'exactly one feedback row referencing that filename is inserted' },
    { id: 'TS-3', scenario: 'Repeated detection of the same open gap does not duplicate tickets', test_type: 'integration', given: 'a RECENT gap already has an open feedback row from a prior run', when: 'the notifier runs again with that gap still RECENT', then: 'no second feedback row is created' },
    { id: 'TS-4', scenario: 'Conformance gauge reports the correct undispositioned count', test_type: 'unit', given: 'verify-migration-apply-state.mjs --json reports 14 RECENT gaps with 4 dispositioned', when: 'the gauge command runs', then: 'it reports 10 undispositioned RECENT gaps' },
    { id: 'TS-5', scenario: 'Staleness guard does not mark a migration-path premise STALE on commit count alone when the object is still absent live', test_type: 'unit', given: 'referenced_files includes a migration file with 5 recent commits and probeDeclaredObjectsExist mocked to executed=false', when: 'checkPremiseLiveness runs', then: 'fileMatch is not set true on that basis alone; overall status is not STALE purely from this branch' },
    { id: 'TS-6', scenario: 'Staleness guard corroborates and marks STALE when the object is confirmed live', test_type: 'unit', given: 'referenced_files includes a migration file with commits and probeDeclaredObjectsExist mocked to executed=true', when: 'checkPremiseLiveness runs', then: 'fileMatch is set true, corroborated' },
    { id: 'TS-7', scenario: 'Live-state probe unavailable falls back safely with a caveat', test_type: 'error', given: 'probeDeclaredObjectsExist throws (DB unreachable)', when: 'checkPremiseLiveness runs on a migration-path referenced file', then: 'the function still returns (fail-open preserved) and the evidence array states corroboration was unavailable' }
  ],
  acceptance_criteria: [
    'Witness RPC set_venture_pbn_verdict_stage_zero is present and callable live; drift-guard no longer reports it as a RECENT gap',
    'A newly-detected RECENT gap produces exactly one feedback/QF row, not a CI-log-only signal, and is deduplicated across repeated detections',
    'A conformance gauge command reports the current RECENT-undispositioned gap count on demand',
    'lib/eva/premise-liveness.js no longer treats commit count on a migration-path file as sufficient evidence of a live fix -- it corroborates via a live-state probe',
    'All new/changed tests pass; no regressions in existing migration-apply-state or premise-liveness test suites'
  ],
  risks: [
    { risk: 'Applying the witness migration live could interact with in-flight venture data if venture_nursery rows already exist with conflicting state', probability: 'LOW', impact: 'MEDIUM', mitigation: 'apply-migration.js --prod-deploy runs transactionally with the existing 3-factor review; inspect the migration diff and check for existing venture_nursery rows before approving', rollback_plan: 'The migration is additive (new column + constraint + function); rollback via a companion DROP migration reviewed through the same 3-factor gate if the apply causes issues' },
    { risk: 'Auto-filing a feedback row on every new RECENT gap could create noise if the drift-guard has false positives or flaps', probability: 'MEDIUM', impact: 'LOW', mitigation: 'Dedupe by filename (one open ticket per gap file, not per CI run); reuse the existing dispositions ledger to suppress known-legacy gaps from the RECENT set before FR-2\'s diff runs', rollback_plan: 'Disable the new-gap notifier step in the workflow (single step removal) while keeping the underlying detection intact' },
    { risk: 'Adding a live-state probe to premise-liveness.js introduces a DB round-trip and dependency into SD creation, which currently only shells out to git', probability: 'LOW', impact: 'LOW', mitigation: 'Reuse the existing lightweight probeDeclaredObjectsExist audit-log fast path already used by pending-migrations-check.js; scope the probe to only migration-path referenced files (the common case has zero or few), and fail-open with a caveat on probe error rather than blocking SD creation', rollback_plan: 'Feature-scope the corroboration branch behind an early-return guard (skip corroboration, keep commit-count-only behavior) if it proves too slow or flaky in practice' }
  ],
  implementation_approach: {
    phases: [
      { phase: 'Phase 1', description: 'Apply the witness migration (FR-1)', deliverables: ['set_venture_pbn_verdict_stage_zero live', 'drift-guard workflow_dispatch confirms green for this file'] },
      { phase: 'Phase 2', description: 'Accountability loop + conformance gauge (FR-2, FR-3, FR-4)', deliverables: ['gap-history persistence', 'new-gap notifier step in migration-deploy-drift-guard.yml', 'conformance gauge npm script'] },
      { phase: 'Phase 3', description: 'Staleness-guard corrective + preventative (FR-5, FR-6)', deliverables: ['live-state corroboration branch in premise-liveness.js', 'regression tests', 'anti-pattern doc note'] }
    ],
    technical_decisions: [
      'Reuse probeDeclaredObjectsExist rather than writing a second pg-introspection path, to avoid two divergent definitions of "is this migration applied"',
      'Persist the gap-history baseline durably (DB/audit_log) rather than in the CI runner filesystem, since GitHub Actions runners are ephemeral per-run',
      'Scope FR-5\'s corroboration to migration-path referenced files only, leaving the existing commit-count-only behavior for all other premise classes unchanged (narrowest fix for the demonstrated failure mode)'
    ]
  },
  integration_operationalization: {
    consumers: [
      { name: 'migration-deploy-drift-guard.yml (CI)', interaction: 'Existing detector extended to call the new-gap notifier after computing gaps', frequency: 'Every push to main touching migration paths, plus daily 09:17 UTC cron' },
      { name: 'LEO fleet workers / coordinators', interaction: 'Receive a feedback/QF row when a new RECENT gap is auto-filed, and can run the conformance gauge command on demand', frequency: 'As gaps occur / on demand' },
      { name: 'leo-create-sd.js --from-feedback (SD creation)', interaction: 'checkFeedbackPremiseLiveness now corroborates migration-path claims via live-state before returning STALE', frequency: 'Every SD creation from a feedback row referencing a migration file' }
    ],
    dependencies: [
      { name: 'scripts/lib/migration-guards.js (3-factor @approved-by gate)', type: 'downstream', contract: 'apply-migration.js --prod-deploy calls validateProdDeployGuards unchanged', failure_handling: 'Apply is blocked if any of the 3 factors fail; unchanged behavior' },
      { name: 'scripts/verify-migration-apply-state.mjs', type: 'upstream', contract: 'FR-2/FR-4 consume its --json output as the source of truth for RECENT/LEGACY gap classification', failure_handling: 'MIGRATION_APPLY_STATE_INFRA_ERROR marker already demotes DB-unreachable to a non-blocking warning; FR-2/FR-4 must honor the same marker rather than treating an infra error as zero gaps' },
      { name: 'feedback table / feedback pipeline', type: 'downstream', contract: 'FR-3 inserts rows via the existing feedback insert path used elsewhere in the codebase', failure_handling: 'A feedback-insert failure must not fail the CI gate itself -- log and continue, matching the existing fail-soft audit pattern in recordTierAudit()' }
    ],
    data_contracts: [
      { contract_name: 'RECENT gap-history baseline', schema: '{ recorded_at: timestamptz, recent_files: string[] }', validation: 'recent_files entries match the verify-migration-apply-state.mjs --json gap filename format', versioning: 'Additive; no breaking schema change to existing tables required if stored as a new audit_log row per run' }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'FR-2/FR-3/FR-4 ship as changes to an existing GitHub Actions workflow file and new/extended Node scripts -- no deployment step beyond merge to main. FR-5/FR-6 ship as a lib/ change picked up by the next SD-creation invocation.'
    },
    observability_rollout: {
      monitoring: ['migration-deploy-drift-guard.yml run status (existing)', 'New feedback rows tagged with the gap filename (queryable)', 'Conformance gauge output count trend'],
      alerts: ['None new required -- the existing gate already fails CI loudly; FR-2/FR-3 add a secondary, deduplicated notification channel'],
      rollout_strategy: 'Direct merge; FR-1 is a one-time manual apply gated by the existing 3-factor review, FR-2-FR-6 are additive to existing surfaces with no flag needed',
      rollback_trigger: 'New-gap notifier producing duplicate or noisy feedback rows in practice',
      rollback_procedure: 'Remove the new-gap-notifier step from migration-deploy-drift-guard.yml (the underlying detection step is untouched and keeps failing CI loudly as before)'
    }
  },
  exploration_summary: {
    files_read: [
      'scripts/modules/handoff/pre-checks/pending-migrations-check.js',
      '.github/workflows/migration-deploy-drift-guard.yml',
      '.github/workflows/pre-merge-migration-readiness.yml',
      '.github/workflows/housekeeping-prod-promotion.yml',
      '.github/workflows/housekeeping-staging-selfcontained.yml',
      'scripts/lib/migration-tier-classifier.mjs',
      'scripts/lib/migration-guards.js',
      'scripts/apply-migration.js',
      'lib/eva/feedback-premise-adapter.js',
      'lib/eva/premise-liveness.js',
      'scripts/leo-create-sd.js'
    ],
    patterns_identified: [
      'Verify-only CI gates (migration-deploy-drift-guard.yml) run post-merge and cannot block the introducing PR, unlike pull_request-triggered gates (pre-merge-migration-readiness.yml)',
      'Fail-soft audit pattern (recordTierAudit in pending-migrations-check.js) -- audit writes are best-effort and never block the primary operation',
      'MIGRATION_APPLY_STATE_INFRA_ERROR / MIGRATION_APPLY_STATE_MISCONFIG bracketed markers distinguish operator error (loud fail) from transient DB outage (non-blocking warning) -- FR-2/FR-4 must reuse this distinction, not re-derive it'
    ],
    key_decisions: [
      'Corrected the source feedback\'s "silent failure" framing after finding migration-deploy-drift-guard.yml CI run history showing loud, repeated failures naming the exact witness file -- reframed the fix direction around enforcement/accountability rather than re-detection',
      'Scoped FR-5\'s live-state corroboration narrowly to migration-path referenced files rather than rewriting checkPremiseLiveness generally, per LEAD notes\' corrective+preventative framing and to keep the SD to a small, reviewable diff'
    ],
    exploration_date: new Date().toISOString().slice(0, 10)
  },
  metadata: {
    lead_directed_fr: ['FR-5', 'FR-6'],
    corrected_premise: true,
    plan_created_by: 'Golf-8 (PLAN)',
    plan_created_at: new Date().toISOString()
  }
};

const { error } = await supabase.from('product_requirements_v2').insert(prd);
if (error) {
  console.error('PRD_INSERT_ERR:', error.message, error.details || '');
  process.exit(1);
}
console.log('OK: PRD inserted:', prd.id);
