import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const PRD_ID = 'PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('functional_requirements').eq('id', PRD_ID).single();
if (readErr) { console.error(readErr.message); process.exit(1); }

const frs = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-2') {
    return {
      ...fr,
      requirement: "Add assertOutreachAuthorized() as the OUTREACH choke point, positive predicate, distinct from checkStageGate()'s SD/QF-gating semantics",
      description: "SHIPPED (Solomon's amended design, coordinator directive 7c1c6622, 2026-09-12): checkStageGate()'s rule (a) (no venture -> OUT_OF_SCOPE) and rule (c) (is_demo -> OUT_OF_SCOPE) are correct for SD/QF gating but WRONG for outreach -- both must REFUSE, not pass through. lib/governance/stage-gate-predicate.js gained assertOutreachAuthorized({supabase, ventureId, actorType, actorId}) -> {authorized, mode:'live'|'mock', reason, snapshot}: authorized iff venture resolves AND is_demo=false AND status='active' AND current_lifecycle_stage>=24 AND launch_mode='live'. It calls checkStageGate(armed:true, forced unconditionally) to reuse audit_log instrumentation and the one-shot chairman override (the sole chairman touchpoint), but evaluates the positive predicate independently against checkStageGate()'s new `venture` snapshot field (added: is_demo, current_lifecycle_stage, launch_mode, status) -- it does NOT read checkStageGate()'s own blocked/verdict. The prior launch_mode-AND-condition on checkStageGate() rule (e) (my earlier FR-2 draft) is RETAINED as a separate, complementary belt-and-suspenders improvement to the SD-gating predicate itself -- orthogonal to this wrapper.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'A null ventureId is REFUSED (mode:mock), never OUT_OF_SCOPE-passed-through',
        'An is_demo=true venture is REFUSED (mode:mock) even at stage>=24/launch_mode=live/status=active',
        "A non-demo, active, stage>=24, launch_mode='live' venture is authorized (mode:live)",
        'A chairman override authorizes (mode:live) even when the raw snapshot would otherwise refuse',
        "STAGE_GATE_PREDICATE_ARMED's live state never affects the outcome -- armed:true is forced unconditionally",
      ],
    };
  }
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      requirement: 'Wire assertOutreachAuthorized() into the single choke point (autonomy-gate.js checkPublishAuthorization) and propagate mode through publisher/index.js\'s return contract',
      description: "SHIPPED: checkPublishAuthorization() (lib/marketing/autonomy-gate.js) now calls assertOutreachAuthorized() instead of inline checkStageGate()+shouldEnforceBlock(). A refusal returns {allowed:false, mode:'mock', reason:'OUTREACH_NOT_AUTHORIZED (fail-closed): <reason>'} BEFORE the autonomy_state/ledger logic ever runs. Both allowed:true paths (autonomous-tier and already-accepted propose_and_approve) now carry mode:outreach.mode. publisher/index.js propagates mode through all 3 of its own return paths: the authCheck deny (mode:outreach.mode), the credential-missing dry-run (mode:authCheck.mode, NOT hardcoded 'mock' -- an authorized autonomous-tier send that already wrote an 'accepted' ledger row but then hits missing credentials must still be flagged for reconciliation), and the real adapter-dispatch success (mode:'real', the only path that actually invoked adapter.publish()). content-pipeline.js/owned-audience-content-loop.js STILL NEED to consume this mode field before crediting a publish as real (recordPublishOutcome wiring) -- that consumption is the still-pending part of this FR.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        "checkPublishAuthorization() returns mode:'mock' on any outreach refusal, before ledger/autonomy logic runs",
        "publisher/index.js's real adapter-dispatch path returns mode:'real'",
        'publisher/index.js\'s credential-dry-run path returns mode:authCheck.mode (propagated, not hardcoded)',
        'content-pipeline.js and owned-audience-content-loop.js consume .mode (not bare .success) before crediting totalPublished/status=posted (STILL PENDING)',
      ],
    };
  }
  return fr;
});

const { error: updErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs, updated_by: 'Alpha-2 (EXEC, post-coordinator-directive implementation)' }).eq('id', PRD_ID);
if (updErr) { console.error(updErr.message); process.exit(1); }
console.log('PRD FR-2/FR-3 updated to reflect the shipped assertOutreachAuthorized() design.');
