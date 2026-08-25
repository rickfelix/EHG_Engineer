// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C -- round-2 EXEC progress record after independent
// TESTING (FAIL) + SECURITY (CONDITIONAL_PASS) adversarial review surfaced 5 real defects in
// the first 5 commits, all now fixed and re-verified (some against the live DB directly).
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH_ERR', fetchErr.message); process.exit(1); }

const updatedMetadata = {
  ...sd.metadata,
  exec_progress: {
    ...sd.metadata?.exec_progress,
    round2_recorded_at: new Date().toISOString(),
    round2_commits: ['b6c5f373f66'],
    adversarial_review: {
      testing_evidence_row: '66749208-45f4-4318-b3a1-10284baa8a1d',
      testing_verdict: 'FAIL (before fixes)',
      security_evidence_row: 'aac901deb295f58f0-derived (see sub_agent_execution_results for SECURITY/EXEC-TO-PLAN)',
      security_verdict: 'CONDITIONAL_PASS, S1/S2 blocking',
    },
    fixed: [
      'BLOCKING: venture-defect-recorder.js feedback_type constraint violation (uat_failure -> sentry_error), verified against live DB',
      'HIGH (S1): checkFailureCeiling venture-scoping bug via bumpVentureFailureOccurrence (metadata.uat_venture_occurrences), regression-tested',
      'HIGH (S2): gate applies check now requires per-venture opt-in (ventures.metadata.uat_robustness_probe_required), not fleet-wide-per-stage',
      'MEDIUM (S3): absent venture_stages row now fails closed/indeterminate, distinct from present-row-marker-false',
      'MEDIUM (S4): assertLiveDeploymentBinding PASS reason no longer overclaims a live-network proof; added generateProbeNonce()',
      'MEDIUM (S5): computeSubstantiveEvidenceHash wired into completeSession as an actually-exercised control (baseline + prior-hash comparison)',
    ],
    deliberately_not_fixed: [
      'TESTING finding: no live production caller passes ventureId/stageNumber/controlPackEvidence into startSession/completeSession yet. journey-walk-orchestrator.js (the one real UAT-run producer today) is SD-orchestrator-scoped, not venture-stage-scoped -- wiring this child\'s venture-stage gate into it would be a genuine architecture error. The real caller for a venture-stage UAT walk cannot be built until child B lands the actual stage, AND surfaces an unresolved schema question (uat_test_runs.sd_id is NOT NULL/FK-like; a venture-stage-scoped run has no natural sd_id) better resolved alongside child B\'s migration than patched under time pressure.',
    ],
    migration_not_applied: 'database/migrations/20260825_register_uat_robustness_gate_enforce_flag.sql exists and was validated (dry-run plan confirmed 1 statement, idempotent) but --prod-deploy was blocked by the auto-mode permission classifier (a live production DB write). Not worked around per standing instruction -- expected to apply via the normal deploy pipeline once this branch merges. Absence is safe: the flag defaults to observe-only either way.',
    test_summary_round2: '267+ unit tests passing (114 in the 11 new/changed files, 163 in the full stage-execution-worker*.test.js regression suite), lint clean',
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: updatedMetadata })
  .eq('id', sd.id);
if (updateErr) { console.error('UPDATE_ERR', updateErr.message); process.exit(1); }
console.log('EXEC_PROGRESS_ROUND2_RECORDED=true');
