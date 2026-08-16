import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Reproduce the EXACT candidate query both pickers use, then classify with the real predicate.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require('../lib/fleet/claim-eligibility.cjs');
const { data, error } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, priority, parent_sd_id, category, current_phase, sd_type, metadata, target_application')
  .in('status', ['draft','in_progress','planning','active'])
  .order('priority', { ascending: false })
  .order('created_at', { ascending: true })
  .limit(20);
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('candidates fetched:', data.length);
let refusedWith = {}, eligible = 0;
for (const r of data) {
  const reason = classifyDispatchIneligibility(r); // no ctx, exactly as PRD assumes
  if (reason) { refusedWith[reason] = (refusedWith[reason]||0)+1; }
  else eligible++;
}
console.log('WITH sd_type+metadata+target_application in select -> refusals:', JSON.stringify(refusedWith), 'eligible:', eligible);
// Now simulate the PRD's TR-4 minimum (metadata ONLY, no sd_type / no target_application)
let refused2 = {}, eligible2 = 0;
for (const r of data) {
  const partial = { id: r.id, sd_key: r.sd_key, title: r.title, status: r.status, priority: r.priority, parent_sd_id: r.parent_sd_id, category: r.category, current_phase: r.current_phase, metadata: r.metadata };
  const reason = classifyDispatchIneligibility(partial);
  if (reason) { refused2[reason] = (refused2[reason]||0)+1; } else eligible2++;
}
console.log('METADATA-ONLY select (TR-4 minimum) -> refusals:', JSON.stringify(refused2), 'eligible:', eligible2);
// orchestratorsOnly variant (findNextAvailableOrchestrator shape: parent_sd_id IS NULL)
const top = data.filter(r => r.parent_sd_id === null);
let refused3 = {}, elig3 = 0;
for (const r of top) { const reason = classifyDispatchIneligibility(r); if (reason) refused3[reason]=(refused3[reason]||0)+1; else elig3++; }
console.log('TOP-LEVEL ONLY (n=' + top.length + ') full-shape refusals:', JSON.stringify(refused3), 'eligible:', elig3);
// how many top-level active SDs are sd_type=orchestrator overall?
const { count: orchCount } = await sb.from('strategic_directives_v2').select('id', {count:'exact', head:true}).eq('sd_type','orchestrator').in('status',['draft','in_progress','planning','active']);
console.log('non-terminal sd_type=orchestrator rows in DB:', orchCount);
