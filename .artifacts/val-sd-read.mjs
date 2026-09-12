import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, progress, metadata')
  .eq('id','2d4e7fea-d8db-447e-a75e-0a8ad201f6c4').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
console.log('sd_key:', data.sd_key, '| status:', data.status, '| phase:', data.current_phase, '| progress:', data.progress);
console.log('\n=== metadata.migration_files ===');
console.log(JSON.stringify(data.metadata?.migration_files, null, 2));
console.log('\n=== metadata keys ===');
console.log(Object.keys(data.metadata||{}).join(', '));
