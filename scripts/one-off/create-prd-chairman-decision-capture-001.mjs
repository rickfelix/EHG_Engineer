#!/usr/bin/env node
import 'dotenv/config';
import { addPRDToDatabase } from '../prd/index.js';

const content = {
  executive_summary:
    'Widen the chairman-decision capture reconciler to cover both capture categories, schedule it via a daily cron, and fix a CHECK-violating resolve and a cron-blocking status probe.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'apply-chairman-decision-captures.mjs queries both chairman_decision_capture and chairman_ruling_capture categories.',
      description: 'Widen the reconciled category from a single literal to a CATEGORIES array, queried via .in(\'category\', CATEGORIES), so chairman_ruling_capture rows (previously invisible to the reconciler; 4 live rows) are reconciled identically to chairman_decision_capture rows.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'CATEGORIES = [\'chairman_decision_capture\', \'chairman_ruling_capture\'] is defined at module scope.',
        'The feedback query uses .in(\'category\', CATEGORIES), not .eq(\'category\', CATEGORY).',
        'A capture with category=\'chairman_ruling_capture\' is classified and processed identically to one with category=\'chairman_decision_capture\'.'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'The RPC-applied resolve path satisfies the feedback table\'s terminal-resolution CHECK constraints.',
      description: 'The prior bare update({status:\'resolved\'}) on the feedback row carried none of quick_fix_id/resolution_sd_id/resolution_notes, violating chk_resolved_requires_reference and chk_feedback_terminal_resolution for these captures (which have no FK references). Route through the canonical resolveFeedback() helper with a populated resolution_notes and a new resolutionType=\'chairman_decision_applied\'.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'The RPC-applied branch calls resolveFeedback({supabase, feedbackId, notes, resolutionType}), not a bare .update().',
        'resolveFeedback() accepts an optional resolutionType param and sets feedback.resolution_type when supplied.',
        'The resolve call\'s result is checked; an unresolved row (updated:false) logs a WARN instead of being silently reported as APPLIED.'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'The mark_held branch never resolves the capture\'s feedback row.',
      description: 'A hold is a data annotation (the underlying chairman_decisions row deliberately stays pending so it re-surfaces on unpark), not a resolution. The capture\'s feedback row must stay status=\'new\' after a hold marker is applied, not be marked resolved.',
      priority: 'HIGH',
      acceptance_criteria: [
        'The mark_held branch contains no call to resolveFeedback() or a feedback .update().',
        'After a successful hold-marker apply, the capture\'s feedback row status is unchanged (still \'new\').'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'The reconciler runs on a durable, unattended schedule.',
      description: 'apply-chairman-decision-captures.mjs previously had zero scheduled trigger anywhere in the repo (grep across scripts/, package.json, .github/ found none) -- it only ran when a human typed the command. Add a GitHub Actions cron workflow running it daily at 13:00 UTC with --apply by default (a workflow_dispatch dry_run input can override to skip --apply for manual inspection).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        '.github/workflows/apply-chairman-decision-captures-cron.yml exists with a schedule trigger (cron: \'0 13 * * *\') and a workflow_dispatch trigger.',
        'The scheduled/default-dispatch run passes --apply; only an explicit workflow_dispatch with dry_run=\'true\' omits it.',
        'The workflow does not collide with any other workflow\'s cron schedule or concurrency group name.'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'The FR-1-migration-applied probe (isFixApplied) works correctly under the new scheduled workflow\'s credentials.',
      description: 'isFixApplied() originally used a direct pg client (createDatabaseClient()) requiring SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD, which no *cron*.yml in this repo injects (repo convention: supabase-js + service-role key only). Under the new cron workflow this would permanently report FR-1 as UNKNOWN and BLOCK every RPC capture forever. Route the catalog check through the exec_sql RPC (SECURITY INVOKER, SELECT/WITH-only) on the same supabase-js client the rest of the script already authenticates with -- matching the pooler-fallback pattern already used in scripts/audit-rpc-execute-grants.mjs.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'isFixApplied() calls supabase.rpc(\'exec_sql\', {sql_text: ...}), not createDatabaseClient().',
        'Running the reconciler under only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the cron workflow\'s actual env) correctly resolves isFixApplied() to true/false rather than null/UNKNOWN when fn_chairman_decision_value genuinely exists/does not exist.',
        'fn_chairman_decide (FR-1 of the parent chairman-decision-queue SD) is confirmed live in the database via a direct pg_proc query -- the reconciler is not permanently blocked by a stale premise.'
      ]
    }
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'resolveFeedback() in lib/governance/resolve-feedback.js accepts an optional resolutionType parameter.',
      rationale: 'Sets feedback.resolution_type (a free-text column with no CHECK enum) so downstream readers can distinguish a chairman-decision-applied resolution from other resolution paths (e.g. quick-fix completion, SD completion) without inferring it from resolution_notes prose.'
    },
    {
      id: 'TR-2',
      requirement: 'The cron workflow follows the repo\'s existing scheduled-workflow shape (checkout, setup-node, npm ci --ignore-scripts, a shell run step piping through a log, a job-summary step, and an artifact upload), and pipes any workflow_dispatch input through env: rather than interpolating it into the run: body.',
      rationale: 'Matches the established pattern in .github/workflows/coordinator-stale-qf-disposition-sweep.yml, and avoids shell-injection via a crafted dispatch input (SECURITY sub-agent finding pattern already fixed in that sibling workflow).'
    },
    {
      id: 'TR-3',
      requirement: 'All static-source test coverage for this module uses the established static-pin pattern (reading the source file as text and asserting on regex-matched substrings), not a mocked module import.',
      rationale: 'main() and its helpers use a module-scope supabase client with no dependency-injection seam, matching the same constraint and precedent already established in tests/unit/governance/resolve-feedback.test.js.'
    }
  ],
  system_architecture: {
    overview: 'A single Node.js script (apply-chairman-decision-captures.mjs) queries the feedback table for chairman decision/ruling captures, classifies each as an RPC-apply or a hold-annotation via pure logic (classifyCapture), and applies the resolution through either fn_chairman_decide (Postgres RPC) or a chairman_decisions.brief_data update. A new GitHub Actions workflow invokes the script on a daily schedule.',
    components: [
      { name: 'apply-chairman-decision-captures.mjs', responsibility: 'Query captures, classify, apply (RPC or hold), resolve/annotate feedback rows.', technology: 'Node.js (ESM), @supabase/supabase-js' },
      { name: 'apply-chairman-decision-captures-cron.yml', responsibility: 'Schedule the reconciler to run unattended, daily.', technology: 'GitHub Actions' },
      { name: 'lib/governance/resolve-feedback.js', responsibility: 'Canonical idempotent feedback-row resolver shared across call sites.', technology: 'Node.js (ESM)' },
      { name: 'exec_sql RPC (public.exec_sql)', responsibility: 'SELECT/WITH-only catalog probe callable from supabase-js without a direct pg connection.', technology: 'PostgreSQL (SECURITY INVOKER plpgsql function)' }
    ],
    data_flow: 'GitHub Actions cron trigger -> node script -> supabase-js query on feedback (category IN (...)) -> per-row classifyCapture() -> RPC path: supabase.rpc(\'fn_chairman_decide\', ...) then resolveFeedback() updates feedback.status/resolution_notes/resolution_type -> Hold path: update chairman_decisions.brief_data (feedback row untouched).',
    integration_points: [
      'feedback table (category, status, metadata, resolution_notes, resolution_type columns)',
      'chairman_decisions table (brief_data.hold annotation)',
      'fn_chairman_decide RPC (chairman decision application)',
      'exec_sql RPC (catalog introspection without a pooler connection)'
    ]
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'A chairman_ruling_capture row with metadata.decided=\'approve\' is classified and would be applied via the RPC path.', test_type: 'unit', given: 'A capture object with category conceptually chairman_ruling_capture and metadata.decided=\'approve\', metadata.decision_id set', when: 'classifyCapture(capture) is called', then: 'Returns {action:\'rpc\', decisionId, rpcAction:\'approved\'} -- identical shape to a chairman_decision_capture row' },
    { id: 'TS-2', scenario: 'The RPC-applied branch resolves the feedback row via resolveFeedback with resolution_notes and resolutionType populated.', test_type: 'unit', given: 'Source file scripts/apply-chairman-decision-captures.mjs', when: 'Static-pin test inspects the RPC-applied code block', then: 'resolveFeedback({...notes, resolutionType: \'chairman_decision_applied\'}) is present; no bare .update({status:\'resolved\'}) remains' },
    { id: 'TS-3', scenario: 'The mark_held branch does not resolve the feedback row.', test_type: 'unit', given: 'Source file scripts/apply-chairman-decision-captures.mjs', when: 'Static-pin test inspects the mark_held code block', then: 'No resolveFeedback() call or feedback .update() is present in that block' },
    { id: 'TS-4', scenario: 'resolveFeedback() sets resolution_type when supplied and omits it when not.', test_type: 'unit', given: 'A mock supabase client', when: 'resolveFeedback({supabase, feedbackId, resolutionType}) is called, and separately without resolutionType', then: 'The captured update payload includes resolution_type only in the first call' },
    { id: 'TS-5', scenario: 'isFixApplied() queries the catalog via the exec_sql RPC, not a direct pg connection.', test_type: 'unit', given: 'Source file scripts/apply-chairman-decision-captures.mjs', when: 'Static-pin test inspects the isFixApplied function body', then: 'supabase.rpc(\'exec_sql\', {sql_text: ...}) is present; createDatabaseClient / supabase-connection.js is absent from the function body' },
    { id: 'TS-6', scenario: 'The new cron workflow YAML is syntactically valid and does not collide with an existing schedule.', test_type: 'integration', given: '.github/workflows/apply-chairman-decision-captures-cron.yml', when: 'The file is parsed with js-yaml and compared against every other workflow\'s schedule/concurrency-group', then: 'It parses without error and shares no cron expression or concurrency group with another workflow' },
    { id: 'TS-7', scenario: 'A malicious workflow_dispatch dry_run input cannot inject shell commands.', test_type: 'security', given: 'The cron workflow\'s run: step', when: 'dry_run is passed as e.g. "true; rm -rf /"', then: 'The value is only ever compared via a quoted env-var string equality check ($DRY_RUN_INPUT != "true"), never interpolated into the shell command line' }
  ],
  acceptance_criteria: [
    'All 15 tests in tests/unit/chairman/apply-decision-captures.test.js pass (10 pre-existing classification/trigger tests unmodified, 5 new SD-scoped static-pin tests).',
    'All 35 tests in tests/unit/governance/resolve-feedback.test.js pass (34 pre-existing, 1 covering resolutionType).',
    'PR #8074 (original QF scope) and PR #8079 (VALIDATION/Explore follow-up fixes) are both merged to main.',
    'The new cron workflow is present on main and its YAML parses cleanly.'
  ],
  risks: [
    {
      risk: 'The exec_sql RPC is restricted to SELECT/WITH-only and could be revoked or further restricted in a future migration, silently breaking isFixApplied() again.',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'isFixApplied() already fails soft to null (UNKNOWN) rather than throwing, and every call site treats null as "block and report unknown," never as "assume applied" or "assume absent" -- a future RPC restriction degrades to the same safe blocked state, not a silent false result.',
      rollback_plan: 'Revert scripts/apply-chairman-decision-captures.mjs to the previous isFixApplied() implementation via git revert of the fixing commit; the reconciler continues to run (hold captures unaffected) while a new probe mechanism is designed.'
    },
    {
      risk: 'The daily --apply-by-default cron could apply an RPC decision the chairman did not intend, if a capture were ever mis-captured with the wrong decided value.',
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: 'The reconciler only ever applies captures that already carry metadata.decided=approve/reject from the capture-writing path (out of this SD\'s scope) -- this SD does not change what gets captured or how, only whether/when the already-captured decision gets reconciled. A workflow_dispatch dry_run override exists for manual inspection before any suspicious run.',
      rollback_plan: 'Disable the workflow schedule (comment out or delete the cron: trigger) and fall back to the manual-only invocation that existed before this SD, while the mis-capture is investigated separately.'
    },
    {
      risk: 'Widening to chairman_ruling_capture could surface a structural difference between the two categories that was not anticipated (e.g. a field present on one category\'s captures but not the other).',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Explore sub-agent evidence confirmed both categories share the exact same capture shape (metadata.decision_id / metadata.no_rpc_apply_needed / metadata.decided) via TERMINAL_RECORD_CATEGORIES in lib/chairman/decision-queue.mjs, which already treats them identically for other purposes.',
      rollback_plan: 'Narrow CATEGORIES back to [\'chairman_decision_capture\'] as a one-line revert if a chairman_ruling_capture row is found to break classifyCapture() in practice.'
    }
  ],
  implementation_approach: {
    phases: [
      { phase: 'Phase 1 (shipped, PR #8074)', description: 'Widen categories, fix the CHECK-violating resolve, remove the mark_held resolve, add the cron workflow.', deliverables: ['scripts/apply-chairman-decision-captures.mjs category + resolve-shape changes', 'lib/governance/resolve-feedback.js resolutionType param', '.github/workflows/apply-chairman-decision-captures-cron.yml', 'tests/unit/chairman/apply-decision-captures.test.js (13 tests)', 'tests/unit/governance/resolve-feedback.test.js (1 new test)'] },
      { phase: 'Phase 2 (shipped, PR #8079)', description: 'Fix the two VALIDATION-sub-agent findings from LEAD-TO-PLAN: the cron-blocking isFixApplied() probe and the unchecked resolveFeedback() result.', deliverables: ['isFixApplied() rewritten to use the exec_sql RPC', 'Checked resolveFeedback() result with a WARN on failure', '2 new static-pin tests'] }
    ],
    technical_decisions: [
      'Use the exec_sql RPC (already established in scripts/audit-rpc-execute-grants.mjs as a pooler fallback) rather than adding a new SUPABASE_DB_PASSWORD secret to the cron workflow, to stay consistent with the repo-wide convention that no *cron*.yml injects direct DB credentials.',
      'Default the scheduled/dispatched run to --apply rather than dry-run, since the reconciler\'s entire purpose is to actually apply already-decided captures -- a dry-run-only schedule would not address the SD\'s stated problem (captures piling up unresolved).'
    ]
  },
  integration_operationalization: {
    consumers: [
      { name: 'Chairman decision queue (lib/chairman/decision-queue.mjs)', interaction: 'Reads feedback rows in TERMINAL_RECORD_CATEGORIES (including both capture categories) to render the dashboard/queue view; this SD ensures those rows actually reach a resolved terminal state instead of accumulating indefinitely.', frequency: 'On-demand, whenever the decision queue view is loaded.' },
      { name: 'GitHub Actions scheduler', interaction: 'Triggers the reconciler daily via the new cron workflow.', frequency: 'Daily, 13:00 UTC.' }
    ],
    dependencies: [
      { name: 'fn_chairman_decide RPC', type: 'downstream', contract: 'Called with p_decision_id, p_action, p_rationale; returns an error on failure which the script logs and counts as BLOCKED/FAILED without retrying.', failure_handling: 'A failed RPC call is logged and the capture is left unresolved for the next scheduled run; no partial state is written.' },
      { name: 'exec_sql RPC', type: 'downstream', contract: 'SELECT-only catalog probe; called with a single sql_text parameter.', failure_handling: 'Any error or exception is caught and isFixApplied() returns null (UNKNOWN), which the caller treats as a safe block, never as an assumed true/false.' },
      { name: 'feedback table CHECK constraints (chk_resolved_requires_reference, chk_feedback_terminal_resolution)', type: 'upstream', contract: 'A status=\'resolved\' write must carry a non-empty resolution_notes or an FK reference.', failure_handling: 'resolveFeedback() is fail-soft: a rejected write returns {updated:false, error} rather than throwing, now surfaced as a WARN log line by the caller.' }
    ],
    data_contracts: [
      { contract_name: 'feedback.category', schema: 'text, one of chairman_decision_capture | chairman_ruling_capture (among other unrelated categories)', validation: 'Filtered via .in(\'category\', CATEGORIES) at query time; no schema-level enum enforced.', versioning: 'Adding a third category requires only extending the CATEGORIES array constant.' },
      { contract_name: 'feedback.resolution_type', schema: 'text, free-form (no CHECK enum)', validation: 'Set only when supplied to resolveFeedback(); this SD introduces the new value \'chairman_decision_applied\'.', versioning: 'New values can be added freely; no migration required.' }
    ],
    runtime_config: {
      environment_variables: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      feature_flags: [],
      deployment_considerations: 'The reconciler and the new cron workflow require no deployment step beyond the merged code -- GitHub Actions picks up the schedule from the committed YAML file automatically. No feature flag gates this behavior; the fix and the schedule ship together.'
    },
    observability_rollout: {
      monitoring: ['GitHub Actions run history for apply-chairman-decision-captures-cron.yml (success/failure per scheduled run)', 'The workflow\'s job-summary and uploaded log artifact (apply.log) for each run\'s APPLIED/BLOCKED/SKIPPED/WARN counts'],
      alerts: ['A scheduled run reporting blocked > 0 for more than 2 consecutive days warrants investigation (either FR-1 regressed or a capture is malformed).'],
      rollout_strategy: 'Direct merge to main; the cron workflow activates on its first scheduled tick after merge (no phased rollout, since dry-run-by-default is not this reconciler\'s stated goal).',
      rollback_trigger: 'Two or more consecutive scheduled runs report an unexpected FAILED/BLOCKED spike, or a chairman decision is applied incorrectly.',
      rollback_procedure: 'Delete or comment out the schedule: trigger in the cron workflow YAML to stop unattended runs immediately; the reconciler remains available for manual invocation while the regression is investigated.'
    }
  },
  exploration_summary: {
    files_read: [
      'scripts/apply-chairman-decision-captures.mjs',
      'lib/governance/resolve-feedback.js',
      'tests/unit/chairman/apply-decision-captures.test.js',
      'tests/unit/governance/resolve-feedback.test.js',
      '.github/workflows/coordinator-stale-qf-disposition-sweep.yml',
      '.github/workflows/adam-inbound-backlog-watchdog-cron.yml',
      'scripts/lib/supabase-connection.js',
      'scripts/audit-rpc-execute-grants.mjs',
      'database/migrations/20260317_security_definer_audit.sql',
      'lib/chairman/decision-queue.mjs',
      'database/migrations/20260131_feedback_resolution_enforcement.sql',
      'database/migrations/20260207_feedback_resolution_constraints.sql'
    ],
    patterns_identified: [
      'Static-pin source-text tests are the established pattern for modules with a module-scope client and no DI seam.',
      'No *cron*.yml workflow in this repo injects a direct DB password/pooler URL; catalog probes must go through supabase-js (service-role key) via the exec_sql RPC, not a pg client.',
      'resolveFeedback() is the canonical, idempotent, fail-soft feedback resolver shared across call sites -- new call sites should route through it rather than hand-rolling an update().'
    ],
    key_decisions: [
      'Escalated from QF-20260902-882 to this full SD once actual source LOC (121) exceeded the Tier-2 QF cap of 75, per the LEO protocol\'s mandatory --from-qf escalation path.',
      'Fixed both VALIDATION-sub-agent findings (cron-blocking probe, unchecked resolve) as an immediate follow-up commit within this SD rather than filing separate QFs, since they directly regress this SD\'s own stated goal (captures reconciling reliably on a schedule).'
    ],
    exploration_date: new Date().toISOString()
  }
};

const result = await addPRDToDatabase('SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001', 'Chairman Decision Capture Reconciler: Category Widening, Scheduling, and Resolve-Shape Fix', content);
console.log('RESULT:', JSON.stringify(result, null, 2));
