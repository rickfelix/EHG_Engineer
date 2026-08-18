#!/usr/bin/env node
/**
 * One-off: LEAD enrichment for SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001.
 *
 * Replaces auto-generated boilerplate (key_changes, success_criteria,
 * smoke_test_steps, functional_requirements) with the grounded scope that
 * emerged from LEAD code-reading + live CI history inspection on 2026-08-18.
 *
 * CORRECTS the source feedback's premise: the auto-apply path is not
 * "silently" failing. gh run history for migration-deploy-drift-guard.yml
 * shows it firing loud (::error, non-zero exit) on every push to main and
 * on its daily cron since at least 2026-08-17T13:42Z, correctly naming
 * set_venture_pbn_verdict_stage_zero as NOT_APPLIED [RECENT] among 14
 * RECENT + 131 LEGACY gaps (149 total, 145 undispositioned). The witness
 * RPC's absence from live was re-confirmed via direct RPC probe
 * (PGRST202) at 2026-08-18T11:20Z. What's actually broken is downstream of
 * the loud detector: (a) it runs post-merge, not as a PR-blocking check;
 * (b) no accountability loop turns a RECENT gap into an actionable ticket;
 * (c) the narrow per-SD pre-handoff auto-apply mechanism only auto-applies
 * migrations whose FILENAME matches the sd_key of the SD currently handing
 * off, so a migration merged outside that exact SD's own handoff window is
 * invisible to it forever, by design.
 *
 * Also applies the LEAD notes from coordinator_lead_notes_2026_08_18:
 * reclassify feature->infrastructure, and add the staleness-guard
 * corrective+preventative in-scope.
 *
 * Idempotent: re-running overwrites the same fields with the same values.
 * Preserves existing metadata (merges rather than replaces).
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata, governance_metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('FETCH_ERR:', fetchErr.message);
  process.exit(1);
}

const mergedMetadata = {
  ...(existing.metadata || {}),
  functional_requirements: [
    {
      id: 'FR-1',
      title: 'Apply the witnessed gap and restore drift-guard to green baseline',
      description: 'Apply database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql to live via the unchanged 3-factor @approved-by chairman gate (node scripts/apply-migration.js <path> --prod-deploy). Re-run migration-deploy-drift-guard.yml (workflow_dispatch) and confirm set_venture_pbn_verdict_stage_zero drops out of the RECENT gap list. This restores CRACK-GATE FR-1, which currently no-ops gracefully because the RPC is absent.'
    },
    {
      id: 'FR-2',
      title: 'Accountability loop for newly-detected RECENT gaps',
      description: 'Extend migration-deploy-drift-guard.yml (or a companion script it calls) so that when a NEW RECENT gap appears (a file not previously present in docs/audits/migration-dispositions.json and not seen on the prior run) it auto-files a feedback/QF row via the existing feedback pipeline, instead of only writing to CI logs. Today the gate is loud to CI (::error, non-zero exit) but that verdict has no path to an actionable ticket -- 145 of 149 known gap files are undispositioned and simply accumulate.'
    },
    {
      id: 'FR-3',
      title: 'Migrations-dir-vs-live conformance gauge (auto path)',
      description: 'Add a lightweight summary surface (npm script or dashboard row) reporting the current RECENT-undispositioned gap count from verify-migration-apply-state.mjs, so the accumulation is visible outside CI logs -- same class as the existing STAGED-NOT-ENFORCING gauge, but for the auto (non-chairman-gated) path.'
    },
    {
      id: 'FR-4',
      title: 'Staleness-guard corrective + preventative (LEAD-directed in-scope add)',
      description: 'The SD-creation-time staleness/duplicate guard counted 5 recent commits touching the WITNESS migration file as evidence the runner defect was already fixed (same-file-authoring-commits vs runner-defect confusion), requiring an audited --force-liveness override to proceed. Corrective: the guard must verify via a live-state probe (reuse probeDeclaredObjectsExist / the drift-guard verdict) rather than a commit-count-to-file heuristic. Preventative: document this guard-class confusion (editing a migration file is not evidence the migration was applied) so future creation-time guards use live-state proof instead of git-commit-count proxies.'
    }
  ],
  session_findings: {
    corrected_premise: 'Source feedback framed this as "silent" auto-apply failure. LEAD verification (gh run history) shows migration-deploy-drift-guard.yml has been firing LOUD (::error, exit 1) on every push to main and its daily 09:17 UTC cron since at least 2026-08-17T13:42Z, correctly naming set_venture_pbn_verdict_stage_zero as NOT_APPLIED [RECENT].',
    verified_facts: [
      '14 RECENT (blocking-eligible) + 131 LEGACY (advisory) gaps = 149 total gap files',
      'Only 4 of 149 dispositioned/suppressed; 145 undispositioned',
      'Witness RPC set_venture_pbn_verdict_stage_zero re-probed live 2026-08-18T11:20Z: still PGRST202-absent',
      'pre-merge-migration-readiness.yml is PR-time but advisory-only and scoped to CREATE-OR-REPLACE divergence detection -- would not have caught a brand-new never-applied function/table',
      'migration-deploy-drift-guard.yml is comprehensive (all declared objects, all migration dirs) but runs POST-merge on push -- cannot block the merge that introduced the gap',
      'scripts/modules/handoff/pre-checks/pending-migrations-check.js auto-applies TIER-1 migrations only when their filename matches the sd_key of the SD currently handing off -- a migration merged outside that SD\'s own handoff window is invisible to this mechanism by design'
    ],
    lead_enrichment_at: new Date().toISOString()
  }
};

const updates = {
  sd_type: 'infrastructure',
  scope: [
    'IN-SCOPE:',
    '- FR-1: Apply the witness migration (20260817_set_venture_pbn_verdict_stage_zero.sql) via the existing 3-factor @approved-by apply path; verify drift-guard returns to green for this file',
    '- FR-2: Auto-file a feedback/QF row when migration-deploy-drift-guard.yml detects a NEW RECENT gap (accountability loop, not just CI-log visibility)',
    '- FR-3: Lightweight conformance gauge summarizing the current RECENT-undispositioned gap count for the auto (non-chairman-gated) path',
    '- FR-4 (LEAD-directed): staleness-guard corrective (live-state proof, not commit-count heuristic) + preventative documentation for the same-file-authoring-commits vs runner-defect confusion class',
    '',
    'OUT-OF-SCOPE:',
    '- Making migration-deploy-drift-guard.yml a required/blocking PR status check (separate, higher-blast-radius governance change; not needed to close this SD\'s witness gap or its accountability loop)',
    '- Rewriting the 3-factor @approved-by chairman gate itself (scripts/lib/migration-guards.js) -- unchanged by design',
    '- Retiring/dispositioning the other 144 undispositioned legacy/recent gap files individually -- FR-2/FR-3 make the backlog visible and actionable; clearing it is follow-on work, not this SD',
    '- Bulk-remediating other TIER-2 CEREMONY_PENDING migrations (e.g. 20260817_fdbk_error_capture_rpc.sql) -- that class is already correctly and intentionally staged'
  ].join('\n'),
  description: 'Auto-apply migration path: the witness RPC set_venture_pbn_verdict_stage_zero (database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql, merged 6352a5eba7a) is confirmed absent live (PGRST202, re-probed 2026-08-18T11:20Z). CORRECTED PREMISE (LEAD verification 2026-08-18): this is not a silent failure -- migration-deploy-drift-guard.yml has been firing loud on every push to main and its daily cron since at least 2026-08-17T13:42Z, correctly naming this file as NOT_APPLIED [RECENT] among 14 RECENT / 131 LEGACY gaps (149 total, 145 undispositioned). What is actually broken: the loud detector runs post-merge (cannot block the introducing PR), and there is no accountability loop turning a detected RECENT gap into an actionable ticket -- it only ever reaches CI logs. Separately, the narrow per-SD pre-handoff auto-apply mechanism (pending-migrations-check.js) only auto-applies migrations whose filename matches the CURRENTLY handing-off SD\'s own key, so a migration merged outside that SD\'s own handoff window is invisible to it forever, by design, not by defect. Fix direction: (FR-1) apply the witness gap now; (FR-2) accountability loop for new RECENT gaps; (FR-3) conformance gauge for the auto path; (FR-4, LEAD-directed) staleness-guard corrective+preventative for the same-file-authoring-commits vs runner-defect confusion that required a --force-liveness override at SD creation. Downstream: CRACK-GATE FR-1 no-ops gracefully until FR-1 lands.',
  key_changes: [
    { change: 'FR-1: Apply database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql live via apply-migration.js --prod-deploy (3-factor @approved-by, unchanged)', type: 'fix' },
    { change: 'FR-2: migration-deploy-drift-guard.yml (or a companion script) auto-files feedback/QF on a NEW RECENT gap instead of CI-log-only visibility', type: 'infrastructure' },
    { change: 'FR-3: Lightweight RECENT-undispositioned gap-count summary/gauge for the auto (non-chairman-gated) path', type: 'infrastructure' },
    { change: 'FR-4: Staleness/duplicate SD-creation guard verifies via live-state probe instead of commit-count-to-file heuristic; documents the guard-class confusion', type: 'fix' }
  ],
  success_criteria: [
    { criterion: 'Witness RPC set_venture_pbn_verdict_stage_zero is present and callable live', measure: 'Direct RPC probe returns no PGRST202; migration-deploy-drift-guard.yml (workflow_dispatch) no longer lists this file in RECENT gaps' },
    { criterion: 'A newly-detected RECENT gap produces an actionable ticket, not only a CI log line', measure: 'Simulated/next real RECENT gap results in a feedback or QF row referencing the gap file, verifiable via feedback table query' },
    { criterion: 'RECENT-undispositioned gap count is visible outside raw CI logs', measure: 'New summary command/gauge reports a numeric count matching verify-migration-apply-state.mjs --json output' },
    { criterion: 'SD-creation staleness guard no longer treats witness-file commit count as fix evidence', measure: 'Guard code reads live-state (probeDeclaredObjectsExist or drift-guard verdict) before concluding a runner defect is resolved; unit test covers the same-file-authoring-commits-without-fix scenario' },
    { criterion: 'No regressions in existing migration-apply-state tests', measure: 'npm test -- migration-apply-state exits 0; existing FR-6 wiring proof in migration-deploy-drift-guard.yml still passes' }
  ],
  success_metrics: [
    { metric: 'Witness gap closure', target: 'set_venture_pbn_verdict_stage_zero present in live pg schema' },
    { metric: 'RECENT gap accountability', target: '100% of new RECENT gaps produce a feedback/QF row within one gate run' },
    { metric: 'Zero regressions', target: '0 existing migration-apply-state / drift-guard tests broken' }
  ],
  smoke_test_steps: [
    { instruction: 'Run node scripts/apply-migration.js database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql --prod-deploy (3-factor gate) and confirm success', step_number: 1, expected_outcome: 'Migration applies without error; RPC set_venture_pbn_verdict_stage_zero callable' },
    { instruction: 'Trigger migration-deploy-drift-guard.yml via workflow_dispatch and inspect the RECENT gap list', step_number: 2, expected_outcome: 'set_venture_pbn_verdict_stage_zero no longer appears in RECENT gaps' },
    { instruction: 'Run the new RECENT-gap summary/gauge command', step_number: 3, expected_outcome: 'Reports the current undispositioned RECENT gap count matching verify-migration-apply-state.mjs --json' },
    { instruction: 'Run the staleness-guard unit test covering witness-file-commits-without-live-fix', step_number: 4, expected_outcome: 'Guard correctly reports the defect as unresolved despite recent commits touching the migration file' }
  ],
  risks: [
    { risk: 'Applying the witness migration live could interact with in-flight venture data if venture_nursery rows already exist with conflicting state', mitigation: 'apply-migration.js --prod-deploy already runs the migration transactionally with the existing 3-factor @approved-by review; review the migration diff before approval', impact: 'low', likelihood: 'low' },
    { risk: 'Auto-filing a feedback/QF row on every new RECENT gap could create noise if drift-guard has false positives', mitigation: 'Dedupe by filename (one open ticket per gap file, not one per CI run); the existing dispositions ledger already suppresses known-legacy gaps from the RECENT set', impact: 'low', likelihood: 'medium' },
    { risk: 'Changing the staleness guard to require a live-state probe adds latency/DB dependency to SD creation', mitigation: 'Reuse the existing lightweight probeDeclaredObjectsExist/audit-log fast path already used by pending-migrations-check.js; fail-open to the current commit-count heuristic only as an advisory signal if the probe errors, never silently trusting commit-count alone as proof', impact: 'low', likelihood: 'low' }
  ],
  scope_reduction_percentage: 25,
  governance_metadata: {
    ...(existing.governance_metadata || {}),
    type_change_reason: 'Coordinator LEAD notes (2026-08-18, per Adam advisory db03c577): this is migration-runner harness work, not a customer-facing feature. Reclassifying feature->infrastructure to align validation profile (lighter TESTING/GITHUB requirements, 80% gate threshold) with the actual change shape.',
    type_change_at: new Date().toISOString(),
    type_change_actor: 'LEAD',
    bypass_reason: 'NOT validation avoidance -- creation-time inference mistyped this as feature. Scope is 100% CI/CD harness work (migration-deploy-drift-guard.yml, pending-migrations-check.js, an SD-creation guard) touching zero customer-facing surfaces; the SD produces no UI, no user-visible feature, and no venture-facing behavior change. infrastructure (80%) is the correct profile per CLAUDE_LEAD.md SD Type Classification table, not a threshold-shopping downgrade from feature (85%). Directed by coordinator 0d37100a per Adam advisory db03c577, 2026-08-18.'
  },
  metadata: mergedMetadata
};

const { error } = await supabase
  .from('strategic_directives_v2')
  .update(updates)
  .eq('sd_key', SD_KEY);

if (error) {
  console.error('UPDATE_ERR:', error.message);
  process.exit(1);
}

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key, title, sd_type, priority, target_application, scope_reduction_percentage')
  .eq('sd_key', SD_KEY)
  .maybeSingle();

console.log('OK: SD enriched');
console.log('  sd_key:', sd.sd_key);
console.log('  title:', sd.title);
console.log('  type:', sd.sd_type);
console.log('  scope_reduction_percentage:', sd.scope_reduction_percentage);
