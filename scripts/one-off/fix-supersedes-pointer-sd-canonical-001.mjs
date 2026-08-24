// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — repair a self-referential supersedes_row_id.
// The rev3 write was deduped into the rev2 row in place, so supersedes_row_id ended up pointing at
// the row's own id. Repoint it at the true predecessor. Uses updateAndVerify (read-after-write).
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { updateAndVerify } from '../../lib/db/writeback-verify.mjs';

const ROW_ID = 'dc628f78-2a08-4bb1-bf35-2985890541df';
const TRUE_PREDECESSOR = 'eadd5e30-93dd-4680-82d0-84cb212f5210';

const client = createSupabaseServiceClient();

const { row } = await updateAndVerify({
  client,
  table: 'sub_agent_execution_results',
  match: { id: ROW_ID },
  column: 'metadata',
  patch: {
    supersedes_row_id: TRUE_PREDECESSOR,
    supersedes_chain: [TRUE_PREDECESSOR],
    revision_note: 'rev3 was deduped into the rev2 row in place (5-min window), so this row id serves both revisions',
  },
  verifyKeys: ['supersedes_row_id', 'supersedes_chain', 'revision_note'],
});

const m = row.metadata;
console.log('supersedes_row_id=' + m.supersedes_row_id);
console.log('supersedes_chain=' + JSON.stringify(m.supersedes_chain));
console.log('self_reference_cleared=' + (m.supersedes_row_id !== ROW_ID));
console.log('findings_still_present=' + (Array.isArray(m.findings) ? m.findings.length : 'MISSING'));
console.log('revision=' + m.revision);
