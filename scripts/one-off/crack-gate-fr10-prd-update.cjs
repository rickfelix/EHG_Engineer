require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const metadata = prdRow.metadata || {};

  const fr10 = fr.find((f) => f.id === 'FR-10');
  if (!fr10) throw new Error('FR-10 not found in functional_requirements');

  fr10.acceptance_criteria = [
    "A mid-flight trigger calls composeAcquisitionPacket() automatically at Stage-11 completion -- IMPLEMENTED: lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js calls it right after writeStage11Artifacts() (so the identity_brand_name domainShortlist it just wrote is readable), non-fatal, idempotent (existing pending packet returned as-is). confirmed by code review: previously zero production callers, now exactly one (this trigger)",
    "executeAcquisition() is triggered automatically post-approval, not at Stage-11 completion (that would be premature -- approval hasn't happened yet): IMPLEMENTED via runPostApprovalPipeline() (lib/venture-acquisition/dns-wiring.js), whose OWN doc comment already names fn_chairman_decide(approved) as its exact intended trigger -- wired into scripts/chairman-decisions.mjs's chairmanDecide writer (the same real, live decision-resolution path FR-3 already hooks), filtered on brief_data.packet_kind==='domain_acquisition' after re-fetching the real row (mirrors FR-3's decision_type re-verification -- 'chairman_approval' is a routing category, not a specific packet type)",
    "The trigger correctly reaches (and logs) a credential-blocked state when the registrar token is invalid, rather than failing silently or crashing -- CONFIRMED by code review, not newly built: executeAcquisition() already has a TR-1 plan-mode default (no registrar adapter or execute!==true => {status:'blocked_on_credentials', plan:[...]}, zero live calls) from its ORIGINAL SD (SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001). This FR's trigger deliberately never passes a registrar adapter or execute:true (mirrors FR-4's 'production always plan-mode-only, zero blast radius' precedent) -- wiring the TRIGGER is this FR's job; the registrar-token fix is out of scope regardless of whether this trigger exists",
    "The registrar-token fix itself is explicitly out of this FR's scope and named as an external dependency in the disposition row, not silently dropped -- feedback row 646d0658-331b-4c40-877a-f46bfcb4e287 (code 9109, invalid since 2026-08-12), unchanged by this FR; the plan-mode default means this FR has zero dependency on that fix landing to ship safely",
  ];

  metadata.fr10_implementation_note_2026_08_18 = {
    finding: "Both halves of FR-10 (packet creation + post-approval execution) mirror FR-1's 'wire the trigger to an already-built, well-documented, but never-called function' pattern -- runPostApprovalPipeline's own doc comment even names the exact chairman-decision event this SD independently identified as the real live decision-resolution path (already discovered for FR-3).",
    action_taken: "Stage-11 hook (lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js) calls composeAcquisitionPacket() after artifact write-through. Post-approval hook (lib/eva/bridge/domain-acquisition-trigger.js, wired into scripts/chairman-decisions.mjs's chairmanDecide writer alongside FR-3's bridge) calls runPostApprovalPipeline() in plan-mode only (no registrar/execute deps) -- never makes a live registrar call or spends money, matching FR-4's zero-blast-radius precedent.",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-10 acceptance_criteria updated and metadata.fr10_implementation_note_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
