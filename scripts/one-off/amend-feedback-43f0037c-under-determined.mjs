// Amends feedback row 43f0037c-11a0-4463-863d-0033cfe20d51 (the BIND-OBSERVE-ONLY-001
// finding from SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001's PLAN_VERIFICATION review).
//
// validation-verify-cascade-isolation's re-review found my original causal correction
// ("these 7 rows are a separate, unrelated problem") was PLAUSIBLE but UNDER-DETERMINED, not
// established -- because emitChainingTelemetry (the one instrument that would discriminate
// a cascade-originated LEAD-TO-PLAN attempt from a human-originated one by rejection_reason
// alone, since both produce byte-identical preflight-rejection rows) has never successfully
// written a row (separate schema-mismatch bug, logged as feedback 3100f210). Independently
// confirmed the instrument-gap claim before amending.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FEEDBACK_ID = '43f0037c-11a0-4463-863d-0033cfe20d51';

const { data: row, error: fetchErr } = await supabase
  .from('feedback')
  .select('description')
  .eq('id', FEEDBACK_ID)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const amendment = `AMENDMENT (2026-08-16T18:2xZ, via validation-verify-cascade-isolation, independently re-verified before recording): the causal correction below ("NOT that bug... a SEPARATE, real, recurring problem") is PLAUSIBLE and PROBABLY RIGHT, but should be read as the LEADING HYPOTHESIS, not an established fact. Reason: emitChainingTelemetry -- the one instrument in this codebase that would discriminate a cascade-originated LEAD-TO-PLAN attempt from a human/other-originated one -- has NEVER successfully written a row (separate, systemic schema-mismatch bug: it inserts into system_events using columns that don't exist, silently swallowed at every call site; logged as feedback 3100f210-5dee-446e-b31a-61f979af1283). Both a cascade-originated and a human-originated LEAD-TO-PLAN attempt produce byte-identical HandoffOrchestrator.js prerequisite-preflight rejection rows (same rejection_reason text), so rejection_reason alone cannot actually rule out a cascade origin -- it can only rule out that Step 1.9's GATE_COORDINATOR_AUTHORITY_FENCE fired (which is a different, narrower claim than "not cascade-related at all"). The recommendation below (identify what's repeatedly attempting this handoff) stands and is now sharper: fixing feedback 3100f210 first would make this question actually answerable via system_events, rather than requiring fresh investigation.

--- ORIGINAL TEXT (preserved for provenance) ---
${row.description}`;

const { error: updateErr } = await supabase
  .from('feedback')
  .update({ description: amendment })
  .eq('id', FEEDBACK_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('AMENDED', FEEDBACK_ID);
