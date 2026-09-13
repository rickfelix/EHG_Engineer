import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,priority,created_at,description,scope,metadata')
  .eq('sd_key','SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001').maybeSingle();
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data) { console.log('NOT FOUND by sd_key'); process.exit(0); }
console.log('=== SD ROW ===');
console.log('id:', data.id, '| key:', data.sd_key, '| status:', data.status, '| phase:', data.current_phase, '| prio:', data.priority, '| created:', data.created_at);
console.log('title:', data.title);
console.log('--- description ---');
console.log((data.description||'').slice(0,4000));
console.log('--- scope ---');
console.log((data.scope||'').slice(0,4000));
console.log('--- metadata keys ---');
console.log(Object.keys(data.metadata||{}).join(', '));
console.log(JSON.stringify(data.metadata, null, 2).slice(0, 6000));
