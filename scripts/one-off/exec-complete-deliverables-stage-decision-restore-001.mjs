#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '8cc63fa4-ba64-43b4-b3ec-6ccffaa53ad7'; // SD-LEO-GEN-STAGE-DECISION-RESTORE-001

const evidence = {
  'Pure prefix-invariant validator module': 'FR-1 -- lib/solomon/restore-candidate-validator.js: zero-DB, zero-IO validateRestoreCandidate(candidate, currentDecisionBy), imports normalizeDecisionBy from scripts/coordinator-ack-adam.cjs verbatim. 6 unit tests passing (tests/unit/solomon/restore-candidate-validator.test.js), including a test asserting it is NOT invoked against the 4 manifest rows in this SD\'s own harness code.',
  'Read-only audited staging harness': 'FR-2 -- scripts/one-off/stage-decision-restore-report.mjs: classifyRow/buildReport/generateReport, imports classifyStatement/makeAuditedExecutor from scripts/dr/restore-rehearsal-core.mjs verbatim. 10 unit tests passing including a mock-client test asserting zero non-SELECT statements are ever issued. Live-run against real manifest + log confirmed correct VERIFIED_EXACT/VERIFIED_BATCH/UNVERIFIED tiering (self-caught and fixed a full-UUID-vs-short-id matching bug during this live run).',
  'Explicit chairman accept/reject packaging for the 2 unverified rows': 'FR-5 -- printReport() in scripts/one-off/stage-decision-restore-report.mjs emits a visually distinct "UNVERIFIED -- chairman decision required" section listing 4ca4e7a2 and 98c97aa1 separately from the 2-row apply-ready set. No code path in this SD inserts an attestation row for either id (confirmed by code inspection: the migration\'s INSERT targets only 0f9ffc05 and 922f8dfb).',
  'Honest non-recovery reporting for the remaining 1208 rows': 'FR-6 -- buildReport() reconciles all 1212 manifest rows: verified + unverified + unrecovered_count, pinned by test TS-7 asserting unrecovered_count === 1208 and the full sum === 1212. No code path writes any value for the 1208 rows outside the 4-row manifest slice.',
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
