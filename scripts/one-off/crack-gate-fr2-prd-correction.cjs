require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const FR2_DESCRIPTION = [
  "record-gate-attestation.mjs (scripts/eva/record-gate-attestation.mjs:51) is confirmed to be a bare, unwired CLI -- FR-2 defines a named verdict CONTRACT satisfiable by EITHER the existing human-attested rows OR a future automated producer, and wires a call to that contract into the actual deploy chokepoint.",
  "CORRECTED DESIGN (self-verified 2026-08-18 against docs/reference/venture-gate-attestations-guide.md, the sibling SD's own authoritative reference doc -- superseding the earlier 'REVISED DESIGN' note relayed via coordinator directive fd57f503 from Golf-5's stand-down validation sub-team, whose premise was incomplete): the guide states explicitly (line 36) that 'the automated judgment engine (APA Child E) is a separate, unbuilt draft SD -- this SD provides an interim human-attested path via record-gate-attestation.mjs, not the automated engine itself', and its 'Explicitly out of scope' section (lines 134-139) names stage-17-blueprint-review.js's existing chairman_decisions self-approval write as a KNOWN, DELIBERATELY-UNFIXED self-approval landmine, stating in terms that 'this SD's own attestations deliberately live in a new table, not in chairman_decisions' BECAUSE of that landmine.",
  "Golf-5's relayed design ('bridge-write a venture_gate_attestations row from that SAME call site') would have Stage-17's own artifact-presence scoring pass write its own stage17_judgment PASS attestation -- structurally the exact self-approval pattern the table's vga_attester_not_producer CHECK constraint (and the migration's own 'ARMED AND DISCONNECTED' preamble, lines 16-36) exists to prevent, even though a distinct-string produced_by/attested_by pair could technically satisfy the constraint's letter.",
  "Verified live by trace (not assumption): fetchLatestAttestation() in crack-gate-evaluator.js already reads venture_gate_attestations with ZERO branching on attested_by/produced_by identity -- any row satisfying the table's schema is read identically regardless of producer. This IS acceptance criterion 1's contract, already true structurally; it needs to be documented and proven, not built. And FR-4's already-shipped code (lib/eva/stage-templates/analysis-steps/stage-24-go-live.js:216) already calls evaluateCrackGateStatus() at the real deploy chokepoint before promote() -- this IS acceptance criterion 2, already shipped.",
  "FR-2's actual remaining scope, corrected: (1) document the producer-agnostic contract explicitly (JSDoc + reference guide addition, citing the fetchLatestAttestation/evaluateCrackGateStatus code as the interface both today's human CLI and a future APA-E producer satisfy identically); (2) prove it with a unit test asserting two differently-attributed attestation rows (human-shaped vs a hypothetical automated-producer shape) are read identically; (3) enrich Stage-17's OWN existing recordGateResult() call (lib/eva/artifact-persistence-service.js:335, confirmed to accept a criteria param landing in eva_stage_gate_results.gate_criteria jsonb) with judgment-relevant evidence -- safe, additive, and stays entirely within Stage-17's own pre-existing audit-trail row, never touching venture_gate_attestations.",
  "FR-2 explicitly does NOT add any write to venture_gate_attestations from stage-17-blueprint-review.js -- that producer role is reserved for APA Child E (automated) or a human via record-gate-attestation.mjs (interim), per the guide's own explicit scope boundary.",
].join(' ');

const FR2_ACCEPTANCE_CRITERIA = [
  "A named verdict contract is documented (function signature or interface) that both the existing human-CLI-backed row and a future automated producer can satisfy identically -- SATISFIED STRUCTURALLY by fetchLatestAttestation()'s existing zero-branching-on-producer read; FR-2 documents this explicitly and proves it with a producer-agnostic unit test",
  "The real deploy chokepoint (the path a deploy ACTUALLY travels, per FR-4's stage-state binding) evaluates this contract for every deploy attempt -- ALREADY SHIPPED by FR-4 (stage-24-go-live.js:216 calls evaluateCrackGateStatus() before promote()); verified live by trace, not re-implemented",
  "DEPENDS ON FR-4: FR-4 shipped first (Checkpoint 1) -- satisfied",
  "Stage-17's own recordGateResult() call is enriched with judgment-relevant evidence via the criteria param (safe, additive, stays within eva_stage_gate_results -- never writes venture_gate_attestations)",
  "FR-2 does NOT add an automated venture_gate_attestations write from stage-17-blueprint-review.js -- explicitly out of scope per docs/reference/venture-gate-attestations-guide.md's own scope boundary (APA Child E owns the automated producer role)",
];

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  let fr = prdRow.functional_requirements;
  if (typeof fr === 'string') fr = JSON.parse(fr);
  let metadata = prdRow.metadata;
  if (typeof metadata === 'string') metadata = JSON.parse(metadata);

  const fr2 = fr.find((f) => f.id === 'FR-2');
  if (!fr2) throw new Error('FR-2 not found in functional_requirements');
  fr2.description = FR2_DESCRIPTION;
  fr2.acceptance_criteria = FR2_ACCEPTANCE_CRITERIA;

  metadata = metadata || {};
  metadata.fr2_scope_correction_2026_08_18 = {
    finding: "Golf-5's relayed 'REVISED DESIGN' (coordinator directive fd57f503) proposed an automated bridge-write from stage-17-blueprint-review.js's own recordGateResult() call site into venture_gate_attestations. Self-verified against docs/reference/venture-gate-attestations-guide.md (the sibling SD's own authoritative doc) before writing any code: the guide explicitly reserves the automated stage17_judgment producer role for APA Child E (separate, unbuilt SD) and names stage-17's existing chairman_decisions self-approval write as a known, deliberately-unfixed landmine that is the exact reason venture_gate_attestations exists as a separate table with a judge<>producer CHECK constraint. Corrected FR-2's scope before implementation to avoid resurrecting that landmine under a new table.",
    action_taken: "PRD FR-2 description and acceptance_criteria corrected; verified FR-2's actual criteria are already satisfied by existing fetchLatestAttestation (producer-agnostic contract) + FR-4's shipped chokepoint binding; implemented only the safe remainder (criteria enrichment on Stage-17's own eva_stage_gate_results row + contract documentation + a producer-agnostic test); signaled coordinator re: relay pattern (2nd peer-relayed finding this session needing primary-source correction, after the FR-4/Golf-2 ruling).",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-2 corrected and metadata.fr2_scope_correction_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
