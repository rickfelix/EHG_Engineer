// Marks 6 of 7 user stories for SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001 as completed, with
// per-story verification evidence cited in technical_notes per CLAUDE_EXEC.md's mandatory
// acceptance-criteria verification rule (no bulk-update without individually-cited evidence).
// US-005 (the audit-citation backfill) is genuinely NOT done yet -- blocked by the Bash
// auto-mode classifier on this worker seat (signal 02143827, escalated to Adam) -- and is
// deliberately excluded here; it is dispositioned separately via dispose-user-story.js.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001';

const evidence = {
  'US-001': 'Verified live: STAGE_GATE_PREDICATE_ARMED.is_enabled=true, lifecycle_state=\'enabled\' via the governed requestApproval->approveTransition x2->transitionLifecycleState path, citing chairman_decision:6cb60a30 and chairman_ratification:b75ddfff as the 2 required HIGH-risk approvals (leo_feature_flag_approvals: approvals_received=2/2, status=approved). Live-applied by Adam at the chairman\'s terminal; readback in scripts/one-off/qf-20260912-959-arm-stage-gate-and-graduate.mjs confirms checkStageGate(AltifyAI, requiredStage=24) returns armed:true, blocked:true, shouldEnforceBlock:true.',
  'US-002': 'Verified live: LEO_HIGH_CONSEQUENCE_GATES_ENABLED and HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED both have a non-null rolled_out_at, stamped via the new markRolledOut() governed writer (lib/feature-flags/registry.js). governance-review.js classifyFlag()\'s enabledNeverRolledOut check (line ~74-77, cited in this SD\'s mechanism_verifications metadata) now reads false for both flags.',
  'US-003': 'Verified by test + live probe: transitionLifecycleState() now calls logAudit with action=\'transition\', citing reason/actorId/actorType in new_state (tests/unit/feature-flags/registry-audit-logging.test.js, 2 passing tests including a negative test confirming the HIGH-risk approval gate still throws with no approval on record). Live round-trip against a disposable test flag confirmed a real changed_by citation lands in leo_feature_flag_audit_log.',
  'US-004': 'Verified live: fixed logAudit()\'s silent insert failure (leo_feature_flag_audit_log is an updatable view rejecting any insert naming its environment column, even NULL) for all 7 call sites (createFlag/updateFlag/deleteFlag/transitionLifecycleState/markRolledOut/activateKillSwitch/deactivateKillSwitch) plus setPolicy, using admissible action_type values (create/update/transition/rollback). Live round-trip: createFlag+updateFlag+setPolicy+deleteFlag on a disposable test flag all produced audit rows with real, non-null changed_by citations -- previously zero landed for any mutator in this file.',
  'US-006': 'Verified: scripts/one-off/qf-20260912-959-arm-stage-gate-and-graduate.mjs\'s main guard fixed from the broken `import.meta.url === file://${process.argv[1]}` (never matches on Windows) to isMainModule() (lib/utils/is-main-module.js). Confirmed clean via `npx eslint` (no-raw-ismainmodule-comparison + require-main-guard-in-one-off rules both pass, where the prior pattern would have tripped the former). This was the exact bug Adam\'s dry-run caught live (silent no-op, exit 0, zero DB change) before the fix.',
  'US-007': 'Verified by test: composeEscalatedTitle() in lib/sd-creation/source-adapters/qf.js truncates a title exceeding MAX_TITLE_CHARS (440) with a marker, staying under the varchar(500) column limit (tests/unit/qf-escalation-continuity.test.js, 4 passing tests covering over-cap/at-cap/under-cap/no-title cases). Live-verified by actually re-running `--from-qf QF-20260912-959` (whose own title is ~700 chars) to successful completion: SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001 itself is proof -- its own title is 491 chars, correctly truncated from the original.',
};

const { data: stories, error: fetchErr } = await supabase
  .from('user_stories')
  .select('id, story_key, technical_notes')
  .like('story_key', `${SD_KEY}:%`);

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

for (const story of stories) {
  const usKey = story.story_key.split(':').pop(); // e.g. 'US-001'
  const note = evidence[usKey];
  if (!note) {
    console.log('SKIPPED (no evidence entry -- handled separately)', story.story_key);
    continue;
  }

  const { error: updateErr } = await supabase
    .from('user_stories')
    .update({
      status: 'completed',
      validation_status: 'validated',
      completed_at: new Date().toISOString(),
      technical_notes: `${story.technical_notes ?? ''}\n\nVERIFICATION EVIDENCE: ${note}`.trim(),
    })
    .eq('id', story.id);

  if (updateErr) {
    console.error('UPDATE_ERROR', story.story_key, updateErr.message);
    process.exit(1);
  }
  console.log('Completed', story.story_key);
}
