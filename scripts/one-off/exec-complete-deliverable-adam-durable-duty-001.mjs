#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '27eabc85-1de3-44e2-9b3b-8cb5eb87264b'; // SD-LEO-FIX-ADAM-DURABLE-DUTY-001

const evidence = {
  "Add regression coverage for the qualifier-form parse and the zero-marker CONTRACT DRIFT guard":
    'FR-3 -- tests/unit/adam-startup-check.test.mjs lines 279 and 295 (both already shipped in PR #8674, commit ab483f2889b, before this SD existed). Test 1 ("QF-20260903-433: parseDurableDutyMarkers recognizes the qualifier form...") feeds a qualifier-form marker and asserts it parses to the expected slug AND resolves through missingDurableDuties(md, ADAM_LOOPS). Test 2 ("QF-20260903-433: renderContractParity reports CONTRACT DRIFT...") builds a >1000-char zero-marker fixture and asserts the output matches /CONTRACT DRIFT/ and not /all durable .* duties present/. Independently re-verified via an Explore sub-agent (stored as Explore evidence, LEAD phase, row 9410ada4) and directly: `node --test tests/unit/adam-startup-check.test.mjs` reports 25/25 passing, both named tests in the pass list.',
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
    .update({ completion_status: 'completed', completion_evidence: evidence[key], verified_by: 'EXEC', verified_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) console.error('UPDATE ERR for', row.deliverable_name, error.message);
  else console.log('Completed:', row.deliverable_name.slice(0, 60));
}
