require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FR3_DESCRIPTION = [
  "The existing chairman_site_review check_type on venture_gate_attestations is confirmed observe-only at three independent layers (crack-gate-evaluator.js witness-only write; autonomy-gate.js self-documented 'OBSERVE-ONLY BY DESIGN'; zero references in promote.js). lib/eva/chairman-product-review.js is a real, LIVE mechanism for the 'request' half (requestProductReview() IS called from lib/eva/stage-execution-worker.js in production) -- but SELF-VERIFIED this session (repo-wide grep, zero hits outside its own test file): recordProductReviewVerdict() -- the function that would RECORD a chairman's actual approve/reject verdict -- has ZERO production callers. It uses a different action vocabulary (approve/approve_with_notes/send_back) than the ACTUAL live chairman-decision-resolution path.",
  "The REAL, live, human-identity-carrying path a chairman decision travels today is scripts/chairman-decisions.mjs's `decide` command -> fn_chairman_decide RPC (action vocabulary: approved/rejected), invoked with DECIDED_BY = process.env.CHAIRMAN_DECIDED_BY (defaults to the generic string 'chairman-cli' when unset). 'chairman_approval' is a ROUTING CATEGORY in decision-queue.mjs covering MANY chairman_decisions.decision_type values through this SAME RPC (kill-gate calls, SD approvals, etc.), not just product_review -- the RPC itself only ever sees {decision_id, action}.",
  "CORRECTED DESIGN (self-verified 2026-08-18, superseding the 'REVISED DESIGN' note relayed via coordinator directive fd57f503 from Golf-5's stand-down validation sub-team, which proposed hooking recordProductReviewVerdict() specifically -- a dead code path in production; this is the 2nd distinct technical claim from that same relay needing primary-source correction in this SD, after FR-2's self-approval-landmine finding): bridge-write a chairman_site_review attestation from scripts/chairman-decisions.mjs's chairmanDecide writer (lib/eva/bridge/chairman-site-review-attestation.js) -- the ONE path a real chairman verdict actually travels. After fn_chairman_decide succeeds, re-fetch the real chairman_decisions row and filter on decision_type==='product_review' before ever writing (never trust the routing category alone). SAFE BY CONSTRUCTION, not just by convention: venture_gate_attestations' own vga_chairman_review_is_human CHECK constraint requires attested_by to match a bare-email shape for this check_type -- DECIDED_BY's default ('chairman-cli') fails that regex, so an un-configured invocation cannot silently write a fake attestation; the DB itself refuses it, and the bridge surfaces (never swallows) that rejection without unwinding the already-committed primary chairman_decisions write.",
  "GATE-WIRING ACCEPTANCE CRITERION ALREADY SATISFIED (same pattern discovered for FR-2): crack-gate-evaluator.js's evaluateCrackGateStatus() combines all three checks (pbn, stage17_judgment, chairman_site_review) into ONE evaluation by design ('there is exactly one place this logic lives'), and FR-4's already-shipped code (stage-24-go-live.js:216) already calls that combined evaluator immediately before promote() -- strictly BEFORE any possible distribution, satisfying (and exceeding) 'a gate check fires between deploy-live and distribution, evaluating chairman_site_review status', fully observe-only. FR-3's actual remaining, genuine scope was exclusively the WRITE side: getting real data into the chairman_site_review leg, which was previously always NO_DATA.",
].join(' ');

const FR3_ACCEPTANCE_CRITERIA = [
  "A gate check fires between a venture reaching deploy-live and reaching distribution, evaluating chairman_site_review status -- ALREADY SHIPPED by FR-4 (stage-24-go-live.js:216 calls evaluateCrackGateStatus(), which evaluates all 3 checks including chairman_site_review, before promote()); verified live by trace, not re-implemented",
  "Ships via observe-only (log-and-allow) semantics, never a day-one hard block -- inherited from FR-4's already-observe-only binding; this SD's own write-side bridge never blocks the primary chairman_decisions write either (try/catch, logs and continues on any attestation failure)",
  "DEPENDS ON FR-4: FR-4 shipped first (Checkpoint 1) -- satisfied",
  "A real chairman approve/reject decision on a product_review (decision_type='product_review') chairman_decisions row bridge-writes a chairman_site_review attestation (PASS on approved, BLOCKED on rejected) using the real DECIDED_BY email as attested_by",
  "The bridge re-verifies decision_type==='product_review' against the real chairman_decisions row after the RPC succeeds -- 'chairman_approval' is a routing category covering other decision types through the same RPC, and those must never be attested as a site review",
  "The DB's own vga_chairman_review_is_human constraint is the actual enforcement of 'a real human, not a machine' -- the bridge never reimplements that check client-side, only surfaces the DB's rejection legibly if DECIDED_BY was left at its generic default",
];

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const metadata = prdRow.metadata || {};

  const fr3 = fr.find((f) => f.id === 'FR-3');
  if (!fr3) throw new Error('FR-3 not found in functional_requirements');
  fr3.description = FR3_DESCRIPTION;
  fr3.acceptance_criteria = FR3_ACCEPTANCE_CRITERIA;

  metadata.fr3_scope_correction_2026_08_18 = {
    finding: "Golf-5's relayed 'REVISED DESIGN' (coordinator directive fd57f503) proposed hooking recordProductReviewVerdict() for the bridge-write. Self-verified (repo-wide grep): that function has zero production callers -- the real live chairman-decision-resolution path is scripts/chairman-decisions.mjs -> fn_chairman_decide RPC, a different mechanism entirely with different action vocabulary. This is the 2nd distinct technical claim from directive fd57f503 needing primary-source correction in this SD (1st was FR-2's self-approval-landmine finding; a 3rd, unrelated one was the FR-4/Golf-2 ruling from a different worker) -- recommend the coordinator spot-check whether Golf-5's sub-team relayed similar findings to other SDs.",
    action_taken: "PRD FR-3 description and acceptance_criteria corrected. Implemented the bridge-write against the REAL live path (chairman-decisions.mjs's chairmanDecide writer -> lib/eva/bridge/chairman-site-review-attestation.js), re-verifying decision_type against the live chairman_decisions row rather than trusting the routing category. Verified FR-3's gate-wiring acceptance criterion is already satisfied by FR-4's shipped chokepoint binding (same pattern as FR-2).",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-3 corrected and metadata.fr3_scope_correction_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
