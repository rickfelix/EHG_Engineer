// Marks 6 of 7 sd_scope_deliverables for SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001 as completed,
// with per-deliverable evidence and metadata.producer provenance (required post-cutover by
// isUnprovenancedPostCutover(), semantic-gate-utils.js). FR-5 (the audit-citation backfill) is
// genuinely NOT done yet -- blocked by the Bash classifier, escalated to Adam (signal 02143827)
// -- left as 'pending' rather than falsely marked complete; 6/7 = 85.7% clears SCOPE_AUDIT's
// 80% threshold honestly.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001';

const evidence = {
  'Arm STAGE_GATE_PREDICATE_ARMED through the governed feature-flag registry lifecycle path':
    'Live-verified: leo_feature_flag_approvals shows a 2/2 approved row citing chairman_decision:6cb60a30 and chairman_ratification:b75ddfff; STAGE_GATE_PREDICATE_ARMED.is_enabled=true, lifecycle_state=\'enabled\'. checkStageGate(AltifyAI, requiredStage=24) readback returns armed:true, blocked:true, shouldEnforceBlock:true.',
  'Graduate LEO_HIGH_CONSEQUENCE_GATES_ENABLED and HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED':
    'Live-verified: both flags have non-null rolled_out_at via the new markRolledOut() writer; governance-review.js classifyFlag()\'s enabledNeverRolledOut check now reads false for both.',
  'transitionLifecycleState() must actually record the reason/actor citation it accepts':
    'Verified by test (tests/unit/feature-flags/registry-audit-logging.test.js, 2 passing) and live round-trip: transitionLifecycleState now calls logAudit(action=\'transition\') citing reason/actorId/actorType in new_state.',
  'Fix logAudit()\'s silent insert failure so audit citations actually persist':
    'Live-verified: all 7 logAudit() call sites (createFlag/updateFlag/deleteFlag/transitionLifecycleState/markRolledOut/activateKillSwitch/deactivateKillSwitch) plus setPolicy now use admissible action_type values and conditionally include environment. Round-trip on a disposable test flag confirmed createFlag/updateFlag/setPolicy/deleteFlag all produced cited audit rows.',
  'Fix the apply script\'s Windows main-guard so direct invocation is actually detected':
    'Fixed via isMainModule() (lib/utils/is-main-module.js); confirmed clean under eslint\'s no-raw-ismainmodule-comparison and require-main-guard-in-one-off rules. This was the exact bug Adam\'s dry-run caught live (silent no-op).',
  'Bound an escalated SD\'s title to strategic_directives_v2\'s varchar(500) column limit':
    'Verified by test (tests/unit/qf-escalation-continuity.test.js, 4 passing) and live: this SD\'s OWN title (491 chars) is the product of composeEscalatedTitle() truncating the ~700-char source QF title, proving the fix end-to-end.',
};

const { data: rows, error: readErr } = await supabase
  .from('sd_scope_deliverables')
  .select('id, deliverable_name, completion_status')
  .eq('sd_id', (await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single()).data.id);
if (readErr) { console.error('READ ERR', readErr.message); process.exit(1); }

for (const row of rows) {
  const key = Object.keys(evidence).find((k) => row.deliverable_name.startsWith(k));
  if (!key) {
    console.log('LEFT PENDING (no evidence -- genuinely not done yet):', row.deliverable_name.slice(0, 60));
    continue;
  }
  const { data: current } = await supabase.from('sd_scope_deliverables').select('metadata').eq('id', row.id).single();
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({
      completion_status: 'completed',
      completion_evidence: evidence[key],
      verified_by: 'EXEC',
      verified_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: { ...(current?.metadata || {}), producer: 'exec_worker_verified' },
    })
    .eq('id', row.id);
  if (error) console.error('UPDATE ERR for', row.deliverable_name, error.message);
  else console.log('Completed:', row.deliverable_name.slice(0, 60));
}
