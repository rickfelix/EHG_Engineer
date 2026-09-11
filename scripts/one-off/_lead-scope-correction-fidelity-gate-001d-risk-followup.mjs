import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata, success_criteria')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const followup = `RISK sub-agent follow-up (2026-09-11, sub_agent_execution_results id=2ae33bb5-309d-4a57-8c04-3022e260e98b, LOW/CONDITIONAL_PASS, confidence 88): blast radius confirmed safe -- score/passed/required/blocking computation never reads message text or array length (grepped confirmed: zero \`issues.length\` reads under scripts/modules/handoff or scripts/handoff.js); the message is never even persisted (projectGateResultsForPersistence drops issues/warnings entirely, keeping only name/score/max_score/passed/required/status/fr_classification), so no dashboard or downstream consumer can break. No feature flag needed -- ship behind tests, single-file revert if wrong. Confirms VALIDATION's finding of two live call sites (FR_DELIVERY_TRACEABILITY at EXEC-TO-PLAN, FR_DELIVERY_VERIFICATION at LEAD-FINAL-APPROVAL) and the strict \`=== false\` hazard (same TS-10 fixture, tests/unit/handoff/gates/fr-delivery-classifier.test.js:802, has no has_work_product key at all).

CRITICAL WORDING CORRECTION (this changes the previously-scoped fix): do NOT ship message wording that frames the has_work_product=false case as "could not be measured" / blindness. This module DELIBERATELY refuses to excuse a zero-work-product SD as unmeasurable -- see fr-delivery-classifier.js lines 539-547 and the existing test asserting "blindness needs something to be blind to" (this is exactly why has_work_product=false already resolves to UNDELIVERED, not UNVERIFIABLE, in classifyFrDelivery). Under enforcement this message lands in \`issues\` as the stated justification for a block; "blindness" wording there manufactures bypass pressure. CORRECTED replacement message (aligns with the already-shipped, already-correct per-FR evidence text at fr-delivery-classifier.js line ~588, extended to the aggregate case, and keeps "genuinely missing" verbatim as RISK instructed):

  OLD (both branches, currently): "\${gateName}: \${undelivered}/\${total} FR(s) UNDELIVERED — this SD does use the FR-reference convention (sibling FRs are referenced), so these are genuinely missing"

  has_work_product===true (unchanged, verbatim -- a real gap, convention demonstrably in use elsewhere in the SD): same as OLD above.

  has_work_product===false (NEW, corrected wording -- replaces only the false middle clause, keeps the "genuinely missing" conclusion and blocking-eligibility intact): "\${gateName}: \${undelivered}/\${total} FR(s) UNDELIVERED — no validated story exists for this SD and no admitted TESTING evidence matched any FR, so these are genuinely missing"

This is a narrower, purely factual correction (swap a false clause for a true one) rather than a reframing of the verdict -- UNDELIVERED stays UNDELIVERED, enforcement-eligibility is unchanged, only the stated reason changes from a false claim to a true one.

Live population (measured, not estimated): across the newest 1000 sd_phase_handoffs rows with persisted gate_results, 195 FR-gate entries exist; 24 have undelivered>0; of those, 3 carry convention_in_use=false (the exact population that would have received the false message) -- all 3 are LEAD-FINAL-APPROVAL/FR_DELIVERY_VERIFICATION with delivered=0, undelivered=total, unverifiable=0. This bounds only the LEAD-FINAL-APPROVAL surface (fr_classification is persisted only there); the EXEC-TO-PLAN/FR_DELIVERY_TRACEABILITY surface is unmeasured by this probe (message text is not persisted there either, consistent with the "never persisted" finding above).

Domain risk scores: technical_complexity 2, security 1, performance 1, integration 4, data_migration 1, ui_ux 4 (rises to 6, overall MEDIUM, if the rejected "blindness" wording were shipped instead -- avoided by the corrected wording above).`;

const newMetadata = {
  ...(row.metadata || {}),
  lead_scope_correction: `${row.metadata?.lead_scope_correction || ''}\n\n${followup}`,
};

// success_criteria[1] is NOT origin-tagged -- correct the previously-scoped (now shown wrong)
// "could not be measured" wording to the RISK-approved, factual-swap wording.
const criteria = row.success_criteria;
criteria[1] = {
  criterion: "The shared projectGateResult() function (scripts/modules/handoff/gates/fr-delivery-classifier.js), consumed by BOTH the FR_DELIVERY_TRACEABILITY gate (fr-delivery-traceability-gate.js) and the FR_DELIVERY_VERIFICATION gate (lead-final-approval/gates.js), no longer claims \"this SD does use the FR-reference convention (sibling FRs are referenced)\" when classification.has_work_product is STRICTLY false -- it instead states the TRUE reason (\"no validated story exists for this SD and no admitted TESTING evidence matched any FR\") while KEEPING the \"so these are genuinely missing\" / UNDELIVERED conclusion verbatim (this is a factual-clause swap, NOT a reframing to \"unmeasurable\"/\"blind\" -- the module deliberately refuses to excuse a zero-work-product SD as unmeasurable, per its own existing has_work_product/UNVERIFIABLE design and test coverage, and RISK confirmed that framing would create bypass pressure under enforcement). The has_work_product=true case (a genuinely undelivered FR despite the convention being in use elsewhere in the SD) keeps its existing message completely unchanged. listOf() is also updated to surface each FR's f.evidence text (previously computed but discarded at the reporting layer) alongside id/description.",
  measure: 'NEW characterization tests (none exist today for either branch) assert: (a) has_work_product===false emits "no validated story exists for this SD and no admitted TESTING evidence matched any FR, so these are genuinely missing" and never the old "sibling FRs are referenced" string; (b) has_work_product===true is byte-identical to current behavior; (c) the branch uses strict `=== false` so existing hand-built fixtures with has_work_product undefined (e.g. TS-10, fr-delivery-classifier.test.js:802) route through the TRUE/existing branch; (d) both FR_DELIVERY_TRACEABILITY and FR_DELIVERY_VERIFICATION gate output reflect the fix (shared function, confirmed by both VALIDATION and RISK); (e) the undelivered list includes each FR\'s evidence text. No change to passed/score/required/blocking computation (independently confirmed safe by RISK via direct grep of all read sites). No feature flag -- ship behind tests per RISK\'s recommendation.',
};

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata, success_criteria: criteria })
  .eq('sd_key', SD_KEY);
if (updErr) { console.error('update error:', updErr); process.exit(1); }

console.log('OK: RISK follow-up folded in, success_criteria[1] wording corrected (no more "could not be measured" framing) for', SD_KEY);
