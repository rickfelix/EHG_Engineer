// Stamp metadata.producer on all completed sd_scope_deliverables rows for this SD --
// DELIVERABLES_COMPLETENESS gate's isUnprovenancedPostCutover() requires it for any
// row completed after the 2026-09-05 provenance cutover.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-FDBK-ENH-COMPLETION-FLAG-HARNESS-001';
const now = new Date().toISOString();

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) { console.error('SD_LOOKUP_FAILED', sdErr.message); process.exit(1); }

const { data: rows, error: readErr } = await supabase.from('sd_scope_deliverables').select('id, metadata').eq('sd_id', sd.id);
if (readErr) { console.error('READ_FAILED', readErr.message); process.exit(1); }

for (const row of rows) {
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({ metadata: { ...(row.metadata || {}), producer: 'worker_manual', reconciled_at: now } })
    .eq('id', row.id);
  if (error) { console.error('UPDATE_FAILED', row.id, error.message); process.exit(1); }
}
console.log(`Stamped metadata.producer on ${rows.length} deliverable rows`);
