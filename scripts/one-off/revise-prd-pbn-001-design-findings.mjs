// Revises PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001 to incorporate real, substantive DESIGN
// sub-agent findings (row 4b9ec04b-1fb1-4d66-b622-23d89a95899c, PLAN-TO-EXEC phase):
// D1: acceptance criterion #6's "existing chairman_decisions review surface" claim is FALSE
//     (measured live: get_pending_chairman_items admits only chairman_approval/gate_decision/
//     blocking/okr kinds; 0 stage_gate items at lifecycle_stage=0 returned; no brief_data key).
// D2: a REJECT/TRIM verdict is currently UNOBSERVABLE (no venture/decision row is ever created
//     for it) -- so the PRD's risk-3 mitigation ("chairman can manually re-promote") was false,
//     since nothing exists for a chairman to see or override.
// D3: FR-2(v)'s unpark re-check OVERWRITES the single pbn_verdict column, destroying the prior
//     verdict's rationale on every re-score.
// Fix (design-agent's own recommendation, R2): every verdict (not just parked outcomes) is ALSO
// recorded via the EXISTING recordNurseryEvaluation() audit writer (venture-nursery.js:318) as
// an append-only nursery_evaluation_log entry -- durable regardless of pbn_verdict overwrites,
// and inside FR-4's reuse mandate (no new audit mechanism).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-FEAT-PROVEN-BETTER-NEW-001';
const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001';

const { data: current, error: fetchErr } = await supabase.from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, risks, acceptance_criteria')
  .eq('id', PRD_ID).maybeSingle();
if (fetchErr) throw fetchErr;

const functional_requirements = current.functional_requirements.map((fr) => {
  if (fr.id !== 'FR-2') return fr;
  return {
    ...fr,
    description: fr.description + " (vi) EVERY verdict (PASS, REJECT, and TRIM alike) is ADDITIONALLY recorded via the existing recordNurseryEvaluation() audit writer (verified: venture-nursery.js:318) as an append-only nursery_evaluation_log entry -- durable and queryable independent of whatever the CURRENT pbn_verdict column holds, so a REJECT/TRIM is never silently unobservable and an unpark re-check's overwrite of pbn_verdict never destroys the prior verdict's history. Added per DESIGN sub-agent review (row 4b9ec04b-1fb1-4d66-b622-23d89a95899c, findings D2/D3): the original design left a REJECT/TRIM with no venture/chairman_decisions row and therefore nothing for a chairman to see or override, and the unpark re-check silently destroyed the only record of a prior rejection.",
    acceptance_criteria: [...fr.acceptance_criteria, "Every PBN verdict transition (initial score and every unpark re-check) produces a corresponding nursery_evaluation_log row via recordNurseryEvaluation(), independently queryable even after pbn_verdict is overwritten by a later re-check"],
  };
});

const technical_requirements = [
  ...current.technical_requirements,
  {
    id: 'TR-5',
    requirement: 'Every PBN verdict (PASS, REJECT, TRIM) is recorded via recordNurseryEvaluation() (verified: venture-nursery.js:318) as a nursery_evaluation_log entry, in addition to the pbn_verdict column write',
    rationale: 'Closes DESIGN sub-agent review findings D2 and D3 (row 4b9ec04b-1fb1-4d66-b622-23d89a95899c): without this, a REJECT/TRIM creates no venture/chairman_decisions row and is therefore unobservable to a chairman who might want to override it, and FR-2(v)\'s unpark re-check overwrites the single pbn_verdict column, silently destroying the prior verdict\'s rationale on every re-score. Reuses the EXISTING audit writer venture-nursery.js:318 (already wired to nursery_evaluation_log by SD-EHG-IDEATION-PIPELINE-SEAMS-001 FR-4) rather than introducing a new audit mechanism, staying inside FR-4\'s reuse mandate. If trigger_type\'s CHECK constraint does not already admit a PBN-specific value, use the existing "manual" trigger_type with evaluation_notes carrying the PBN verdict summary rather than widening the constraint.',
  },
];

const risks = current.risks.map((r, i) => {
  if (i !== 2) return r; // risk #3 (0-indexed 2): "gate strands nursery ideas if mis-scoped"
  return {
    ...r,
    mitigation: r.mitigation + " CORRECTED per DESIGN sub-agent review (row 4b9ec04b-1fb1-4d66-b622-23d89a95899c): a mis-scored REJECT/TRIM is NOT currently overridable via any chairman UI action (no venture/decision row is created for it) -- recoverability is via TR-5's nursery_evaluation_log audit trail (durable, queryable, survives an unpark re-check's overwrite of the live pbn_verdict column) plus direct DB action, not a UI override. A dedicated chairman-facing override UI is explicitly deferred to a future SD.",
  };
});

const acceptance_criteria = current.acceptance_criteria.map((ac, i) => {
  if (i !== 5) return ac; // item 6 (0-indexed 5): the UI Coverage / Q7 criterion
  return "UI Coverage (LEAD Q7 CORRECTED from PARTIAL to NONE by DESIGN sub-agent review, row 4b9ec04b-1fb1-4d66-b622-23d89a95899c): the PBN verdict is NOT visible via any existing chairman UI surface for this SD -- measured live that get_pending_chairman_items admits only chairman_approval/gate_decision/blocking-escalation/okr kinds, returns 0 items at lifecycle_stage=0, and has no brief_data/pbn_verdict linkage. Inspectability for this SD is DB-query-only: venture_nursery.pbn_verdict (current verdict) plus nursery_evaluation_log (full history, via TR-5). A dedicated chairman-facing panel is explicitly deferred to a future SD; overriding a REJECT/TRIM today requires direct DB action, not a UI action.";
});

const { data: updated, error: updateErr } = await supabase.from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements, risks, acceptance_criteria })
  .eq('id', PRD_ID)
  .select('id, functional_requirements, technical_requirements, risks, acceptance_criteria')
  .maybeSingle();
if (updateErr) throw updateErr;
console.log('PRD revised:', updated.id);
console.log('FR count:', updated.functional_requirements.length, '| TR count:', updated.technical_requirements.length, '| risks:', updated.risks.length, '| AC:', updated.acceptance_criteria.length);

// Mirror the same correction onto the SD's own success_criteria item 6 for consistency.
const { data: sdCurrent, error: sdFetchErr } = await supabase.from('strategic_directives_v2')
  .select('success_criteria').eq('sd_key', SD_KEY).maybeSingle();
if (sdFetchErr) throw sdFetchErr;
const success_criteria = sdCurrent.success_criteria.map((sc, i) => {
  if (i !== 5) return sc;
  return {
    criterion: 'UI Coverage (LEAD Q7 CORRECTED from PARTIAL to NONE by DESIGN sub-agent review): the PBN verdict is NOT visible via any existing chairman UI surface',
    measure: 'Inspectability is DB-query-only (venture_nursery.pbn_verdict + nursery_evaluation_log audit trail per TR-5); a dedicated chairman-facing panel is explicitly deferred to a future SD',
  };
});
const { error: sdUpdateErr } = await supabase.from('strategic_directives_v2')
  .update({ success_criteria }).eq('sd_key', SD_KEY);
if (sdUpdateErr) throw sdUpdateErr;
console.log('SD success_criteria item 6 corrected to match.');
