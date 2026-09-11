import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';
const PRD_DIRECTIVE_ID = SD_KEY;

const followup = `SECURITY sub-agent follow-up (2026-09-11, sub_agent_execution_results id=0c8c98b2-3752-4550-9e08-c1e7733d4101, PASS, confidence 92): confirms no new persistence mechanism, credential handling, RLS/auth change, or injection sink; the blocking expression never reads has_work_product; the gate name is a hardcoded literal at both call sites, not attacker-influenced.

CORRECTION TO THE EARLIER RISK FOLLOW-UP'S PERSISTENCE CLAIM: the RISK sub-agent's "message text is never persisted... projectGateResultsForPersistence drops issues/warnings" claim is TRUE ONLY for the narrow LEAD-FINAL-APPROVAL-specific projection function (scripts/modules/handoff/executors/lead-final-approval/index.js's projectGateResultsForPersistence, confirmed by direct read: it copies only name/score/max_score/passed/required/status/skip_reason plus a details.total-derived fr_classification block, dropping issues/warnings). It is NOT true for the GENERAL handoff persistence path used by every OTHER handoff type, including EXEC-TO-PLAN (where FR_DELIVERY_TRACEABILITY actually runs): scripts/modules/handoff/recording/HandoffRecorder.js:1097 assigns \`metadata.gate_results = result.gateResults\` UNSTRIPPED -- the full per-gate result object, including its \`issues\`/\`warnings\` arrays, is persisted verbatim into sd_phase_handoffs.metadata.gate_results for every handoff. So the FR-1 aggregate message (and, more materially, FR-2's newly-appended per-FR evidence text) DOES reach durable storage on the EXEC-TO-PLAN surface, not merely console output. This is a real correction to LEAD's own escalation-time understanding, caught only because SECURITY independently re-verified the claim rather than propagating it -- exactly the failure mode GATE_MECHANISM_CLAIM_VERIFIER exists to prevent, applied here even though this particular claim was advisory prose rather than the SD spine itself.

Despite that correction, SECURITY still verdicts PASS on 3 independent grounds specific to FR-2's newly-persisted test_ref-derived evidence text: (1) a test_ref must pass a well-formed-entry check AND resolve to a file that actually exists via a path-traversal-safe resolver (rejects absolute paths and \`..\` segments, requires a path separator, resolves against a repo root sourced exclusively from the infrastructure-controlled v_sub_agent_repo_compliance view, never from the TESTING writer's own claimed metadata.repo_path -- this control already existed, unchanged by this SD); (2) no dangerous sink exists anywhere downstream (gate warnings reach only console output and JSONB persistence through the parameterized Supabase client -- grepped the whole handoff module for raw SQL sinks, none found; grepped src/ for dangerouslySetInnerHTML, none found; no gate message is ever passed to a shell) -- SQL injection, XSS, and command injection are structurally unreachable; (3) the trust tier is unchanged -- FR description text, already free-form PRD-authored content, is already interpolated into these same list lines today, so FR-2 does not introduce a new class of untrusted input to this surface, only a second (already-constrained) one.

TWO NON-BLOCKING ADVISORIES FOLDED INTO SCOPE FOR EXEC:
(a) listOf()'s per-FR evidence-appended output has no entry cap, unlike sibling diagnostic arrays in the same module (e.g. unresolvedTestRefs, bounded by the existing MAX_DIAGNOSTIC_ENTRIES pattern) -- a large FR roster now produces a proportionally larger persisted payload. FOLDED INTO FR-2 as a new acceptance criterion: bound the evidence-appended list using the same MAX_DIAGNOSTIC_ENTRIES pattern already established elsewhere in this file.
(b) FR-4's new regression tests should assert the aggregate/list message content by SUBSTRING match, not full-line equality, since the line now also carries evidence text -- keeps advisory (a)'s eventual size-bound fixable later without churning these new tests. FOLDED INTO FR-4's test guidance.`;

async function main() {
  // 1. Fold the follow-up narrative into SD metadata (append to the running lead_scope_correction log).
  const { data: sdRow, error: sdFetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdFetchErr) throw new Error(`SD fetch failed: ${sdFetchErr.message}`);
  const newMetadata = {
    ...(sdRow.metadata || {}),
    lead_scope_correction: `${sdRow.metadata?.lead_scope_correction || ''}\n\n${followup}`,
  };
  const { error: sdUpdErr } = await supabase.from('strategic_directives_v2').update({ metadata: newMetadata }).eq('sd_key', SD_KEY);
  if (sdUpdErr) throw new Error(`SD update failed: ${sdUpdErr.message}`);

  // 2. Correct FR-2 and FR-4 in the PRD.
  const { data: prdRow, error: prdFetchErr } = await supabase
    .from('product_requirements_v2')
    .select('id, functional_requirements')
    .eq('directive_id', PRD_DIRECTIVE_ID)
    .single();
  if (prdFetchErr) throw new Error(`PRD fetch failed: ${prdFetchErr.message}`);

  const frs = prdRow.functional_requirements;
  const fr2 = frs.find((f) => f.id === 'FR-2');
  const fr4 = frs.find((f) => f.id === 'FR-4');
  if (!fr2 || !fr4) throw new Error('Could not find FR-2/FR-4 in PRD functional_requirements');

  fr2.description += ' SECURITY sub-agent review (2026-09-11, PASS, confidence 92) confirmed this change moves the appended evidence text into durable storage (sd_phase_handoffs.metadata.gate_results is persisted UNSTRIPPED for EXEC-TO-PLAN, correcting an earlier RISK-sub-agent claim that gate messages are never persisted -- that claim held only for the separate, LEAD-FINAL-APPROVAL-specific projectGateResultsForPersistence projection). Confirmed safe regardless (test_ref is already resolved through an existing path-traversal-safe resolver against an infra-controlled repo root; no dangerous sink exists downstream; FR description text -- already free-form -- is already interpolated into these same lines today). Bound the list per SECURITY advisory (a) below.';
  fr2.acceptance_criteria.push(
    'AC-3 (SECURITY advisory, 2026-09-11): the evidence-appended list is bounded using the same MAX_DIAGNOSTIC_ENTRIES pattern already used elsewhere in this file for sibling diagnostic arrays (e.g. unresolvedTestRefs), so a large FR roster cannot produce an unbounded persisted payload.'
  );

  fr4.requirement += ' Per SECURITY advisory (2026-09-11): assert the aggregate/list message content by SUBSTRING match, not full-line equality, since FR-2 appends evidence text to the same lines -- this keeps a future size-bound fix (FR-2 AC-3) from requiring test churn.';

  const { error: prdUpdErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs })
    .eq('id', prdRow.id);
  if (prdUpdErr) throw new Error(`PRD update failed: ${prdUpdErr.message}`);

  console.log('OK: SECURITY follow-up folded into SD metadata and PRD FR-2/FR-4 corrected for', SD_KEY);
}

main().catch((err) => { console.error(err); process.exit(1); });
