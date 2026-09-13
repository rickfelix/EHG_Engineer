import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,priority,description,success_criteria,metadata,scope')
  .eq('sd_key','SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.log('NO ROW'); process.exit(0); }
console.log('id:', data.id);
console.log('title:', data.title);
console.log('status:', data.status, '| phase:', data.current_phase, '| prio:', data.priority);
console.log('--- description ---'); console.log((data.description||'').slice(0,2500));
console.log('--- success_criteria ---'); console.log(JSON.stringify(data.success_criteria,null,1)?.slice(0,2500));
console.log('--- scope ---'); console.log(JSON.stringify(data.scope)?.slice(0,600));
console.log('--- metadata keys ---'); console.log(Object.keys(data.metadata||{}).join(', '));
console.log('--- metadata.key_changes ---'); console.log(JSON.stringify(data.metadata?.key_changes,null,1)?.slice(0,2500));
