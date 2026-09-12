import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata, success_criteria, title')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const followup = `VALIDATION sub-agent follow-up (2026-09-11, sub_agent_execution_results id=697cd021-6a2e-4450-ac21-651ebb574b97, PASS, confidence 92): no duplicate SD/QF found; scope confirmed real and buildable. Two corrections to the LEAD brief above, both folded into success_criteria:

(a) The has_work_product=true aggregate message is NOT already covered by any existing test (no test asserts the exact message text at all -- nearby assertions only match /undelivered/i and an FR id, both of which survive any rewording). Both branches (true and false) need NEW characterization tests, not just the false branch.

(b) Implementation hazard: existing projectGateResult() test fixtures construct classification objects by hand with no has_work_product key at all (undefined), so the branch MUST test strict \`classification.has_work_product === false\`, never a plain truthiness/falsy check -- a truthy-based branch would silently reroute every existing fixture through the new message path.

Additional scope-broadening findings (not hazards, but must be reflected in the PRD):

(c) projectGateResult() is a SHARED function -- both FR_DELIVERY_TRACEABILITY (fr-delivery-traceability-gate.js:66) and FR_DELIVERY_VERIFICATION (lead-final-approval/gates.js:1571) call it, so this fix changes BOTH gates' reported message by construction. The PRD must describe the fix at the shared function, not scope it to one gate name.

(d) A compounding, same-root-cause, same-file finding: listOf() (used to build the undelivered list shown to a reader) reads only id and description off each FR, never f.evidence -- so the more nuanced per-FR evidence text (already computed correctly by classifyFrDelivery, e.g. "nothing was built or validated against this FR") never reaches any reader today. In the has_work_product=false case, the false aggregate line is the ONLY explanation a reader ever sees. This makes the current defect's impact worse than originally scoped and is a one-line, same-PR candidate: surface f.evidence in the undelivered list output alongside id/description.

(e) Provenance confirms the gap is real and not previously addressed: the aggregate line (fr-delivery-classifier.js, the undeliveredList line) was authored by f5183d850d1 (2026-08-01, SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001) and never modified since; SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 (2026-08-18, commit c3d887291cc) fixed the exact same false-claim wording one layer down, at the PER-FR evidence text, and left the aggregate layer standing.

RETITLED (2026-09-11) per VALIDATION's recommendation: the original title was the source QF's verbatim wording about the GATE2_IMPLEMENTATION_FIDELITY defect, which is verified superseded/not-reproducible (see above) -- keeping it would mislead any future duplicate-SD search onto the wrong gate/file. New title names the actual, corrected, still-live defect.`;

const newMetadata = {
  ...(row.metadata || {}),
  lead_scope_correction: `${row.metadata?.lead_scope_correction || ''}\n\n${followup}`,
  lead_retitle_reason: 'Original title was the source QF verbatim text about a since-superseded GATE2_IMPLEMENTATION_FIDELITY defect; retitled per VALIDATION sub-agent recommendation (evidence id 697cd021-6a2e-4450-ac21-651ebb574b97) so future duplicate-SD searches land on the correct gate/file.',
  original_title_at_escalation: row.title,
};

// success_criteria[1] is NOT origin-tagged -- free to broaden with (c)/(d)/(a)/(b) above.
const criteria = row.success_criteria;
criteria[1] = {
  criterion: "The shared projectGateResult() function (scripts/modules/handoff/gates/fr-delivery-classifier.js), consumed by BOTH the FR_DELIVERY_TRACEABILITY gate (fr-delivery-traceability-gate.js) and the FR_DELIVERY_VERIFICATION gate (lead-final-approval/gates.js), no longer claims \"this SD does use the FR-reference convention (sibling FRs are referenced)\" when classification.has_work_product is strictly false -- it instead states, as its own distinguishable finding with an explicit count, that code-level delivery could not be measured at all for those FR(s). The has_work_product=true case (a genuinely undelivered FR despite the convention being in use) keeps its existing, correct message. listOf() is also updated to surface each FR's f.evidence text (previously computed but discarded at the reporting layer) alongside id/description, since today the aggregate line is the ONLY explanation a reader ever sees.",
  measure: 'NEW characterization tests (none exist today for either branch) assert: (a) has_work_product===false emits the new distinct message + correct count and never the old "sibling FRs are referenced" string; (b) has_work_product===true is unchanged from current behavior; (c) the branch uses strict `=== false` so existing hand-built fixtures with has_work_product undefined route through the TRUE/existing branch, not the new one; (d) both FR_DELIVERY_TRACEABILITY and FR_DELIVERY_VERIFICATION gate output reflect the fix (shared function); (e) the undelivered list includes each FR\'s evidence text. No change to passed/score/required computation.',
};

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: newMetadata,
    success_criteria: criteria,
    title: 'FR delivery gates falsely report "sibling FRs are referenced" for SDs with zero delivery-tracking signal at all',
  })
  .eq('sd_key', SD_KEY);
if (updErr) { console.error('update error:', updErr); process.exit(1); }

console.log('OK: VALIDATION follow-up folded in, success_criteria[1] broadened, SD retitled for', SD_KEY);
