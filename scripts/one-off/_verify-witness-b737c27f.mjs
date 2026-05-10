import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verify witness: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A row b737c27f-3e83-4887-999e-3c1ae158faf4
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, status, current_phase, progress, metadata, created_at, updated_at')
  .eq('id', 'b737c27f-3e83-4887-999e-3c1ae158faf4')
  .maybeSingle();

if (sdErr) { console.error('SD query error:', sdErr.message); process.exit(1); }
if (!sd) {
  console.log('NOT FOUND by uuid; trying sd_key SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A');
  const r = await supabase.from('strategic_directives_v2').select('id, sd_key, status, current_phase, progress, metadata').eq('sd_key', 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A').maybeSingle();
  console.log('by sd_key:', JSON.stringify(r.data || r.error, null, 2));
  process.exit(0);
}

console.log('=== Witness SD row ===');
console.log(JSON.stringify({
  id: sd.id,
  sd_key: sd.sd_key,
  status: sd.status,
  current_phase: sd.current_phase,
  progress: sd.progress,
  metadata_reverted_at: sd.metadata?.reverted_at,
  metadata_reverted_reason: sd.metadata?.reverted_reason,
  created_at: sd.created_at,
  updated_at: sd.updated_at
}, null, 2));

// Count handoffs for this SD
const { count: handoffCount } = await supabase
  .from('sd_phase_handoffs')
  .select('*', { count: 'exact', head: true })
  .eq('sd_id', sd.id);
console.log('\nhandoff_count:', handoffCount);

// Count retros for this SD
const { count: retroCount } = await supabase
  .from('retrospectives')
  .select('*', { count: 'exact', head: true })
  .eq('sd_id', sd.id);
console.log('retro_count:', retroCount);

// Try sd_key-based too
const { count: handoffByKey } = await supabase
  .from('sd_phase_handoffs')
  .select('*', { count: 'exact', head: true })
  .eq('sd_key', sd.sd_key);
console.log('handoff_count by sd_key:', handoffByKey);
