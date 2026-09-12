import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: e1 } = await sb.from('strategic_directives_v2')
  .select('*').eq('id','SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001').maybeSingle();
console.log('=== SD ITSELF === err:', e1?.message || 'none');
if (sd) {
  console.log(JSON.stringify({id:sd.id, sd_key:sd.sd_key, title:sd.title, status:sd.status, current_phase:sd.current_phase, priority:sd.priority, parent_sd_id:sd.parent_sd_id, created_at:sd.created_at, updated_at:sd.updated_at, target_application:sd.target_application}, null, 2));
  console.log('--- description (first 5000) ---');
  console.log((sd.description||'(empty)').slice(0,5000));
  console.log('--- scope (first 3000) ---');
  console.log((sd.scope||'(empty)').slice(0,3000));
  console.log('--- metadata keys ---');
  console.log(Object.keys(sd.metadata||{}).join(', '));
  console.log('--- metadata (first 8000) ---');
  console.log(JSON.stringify(sd.metadata, null, 2).slice(0,8000));
} else {
  const { data: sd2 } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status').ilike('id','%DEMAND-ENGINE%');
  console.log('by ilike:', JSON.stringify(sd2, null, 2));
}
