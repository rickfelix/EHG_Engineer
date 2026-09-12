#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '00b9c8b0-ab15-4a95-8baf-59b5120095aa'; // SD-LEO-FIX-FOUR-GATES-RETURNED-001

const evidence = {
  "An optional, additive measured-provenance contract on every gate verdict":
    'FR-1 -- lib/governance/verdict-measured-provenance.js (new: hasMeasuredProvenance/formatMeasuredLine, pure/null-safe) + ValidatorRegistry.normalizeResult (scripts/modules/handoff/validation/validator-registry/core.js) now passes through an OPTIONAL measured field via a conditional spread that adds zero keys when absent. Independently re-verified by an Explore sub-agent (LEAD phase, row 6a36d6e5): grepped all 7 normalizeResult call sites across the gates directory -- only 1 supplies measured, the other 6 are byte-identical to before. Already shipped in PR #8682, commit 01ac0ae796b, before this SD existed.',
  "One exemplar gate wired, not a retrofit of all four historically-buggy gates":
    'FR-2 -- prdQualityValidation (scripts/modules/handoff/validation/validator-registry/gates/gate-1-plan-to-exec.js, lines 80-90) now builds measured:{subject,producer} and passes it into normalizeResult. Re-verified: the other 3 historically-buggy gates (QF-20260903-020/-822/SD-LEO-FIX-GATE-PLAN-EXEC-001, all already completed/closed individually) deliberately do NOT emit measured -- retrofitting them would repeat the "fix instances, not the class" mistake the ticket itself names. tests/unit/plan-to-exec/gate1-prd-quality-leniency.test.js\'s new QF-20260903-379 test confirms result.measured.subject/.producer on the live exemplar.',
  "The measured line is visible to an operator at the actual read site, not only the write site":
    'FR-3 -- scripts/modules/handoff/HandoffOrchestrator.js imports formatMeasuredLine and calls it inside the PLAN-TO-EXEC precheck "GATE SCORES (Precheck)" loop (lines ~635-638), printing the line only when non-null. Independently re-verified by the Explore sub-agent reading the exact hunk at HEAD, confirming the call site and null-safety.',
};

const { data: rows, error: readErr } = await supabase
  .from('sd_scope_deliverables')
  .select('id, deliverable_name, completion_status')
  .eq('sd_id', SD_ID);
if (readErr) { console.error('READ ERR', readErr.message); process.exit(1); }

for (const row of rows) {
  if (row.completion_status === 'completed') { console.log('Already completed:', row.deliverable_name.slice(0, 60)); continue; }
  const key = Object.keys(evidence).find((k) => row.deliverable_name.startsWith(k));
  if (!key) { console.error('NO MATCH for', row.deliverable_name); continue; }
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({
      completion_status: 'completed',
      completion_evidence: evidence[key],
      verified_by: 'EXEC',
      verified_at: new Date().toISOString(),
      metadata: {
        producer: 'explore_subagent_lead_phase',
        producer_run_id: '6a36d6e5-8fdd-4f30-b5c2-6982a2502aee',
        content_hash: 'n/a-retroactive-multi-file-verification',
      },
    })
    .eq('id', row.id);
  if (error) console.error('UPDATE ERR for', row.deliverable_name, error.message);
  else console.log('Completed:', row.deliverable_name.slice(0, 60));
}
