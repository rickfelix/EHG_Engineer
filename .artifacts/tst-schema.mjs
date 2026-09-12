import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// ledger existing rows + columns
const { data: led, error: le } = await s.from('venture_channel_publish_ledger').select('*').limit(1);
console.log('LEDGER cols:', led && led[0] ? Object.keys(led[0]).join(', ') : '(no rows)', '| err:', le?.message||'none');
const { count: ledCount } = await s.from('venture_channel_publish_ledger').select('*', {count:'exact', head:true});
console.log('LEDGER row count (backfill scope):', ledCount);
const { count: cleanCount } = await s.from('venture_channel_publish_ledger').select('*', {count:'exact', head:true}).eq('decision','accepted').eq('outcome','shipped_clean');
console.log('LEDGER accepted+shipped_clean rows:', cleanCount);
// ventures launch_mode
const { data: v, error: ve } = await s.from('ventures').select('id,name,is_demo,launch_mode,current_lifecycle_stage').or('name.ilike.%Altify%,name.ilike.%ApexNiche%');
console.log('VENTURES probe err:', ve?.message||'none');
console.log(JSON.stringify(v, null, 1));
// flag
const { data: f } = await s.from('leo_feature_flags').select('flag_key,is_enabled').in('flag_key',['STAGE_GATE_PREDICATE_ARMED','HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED','LEO_HIGH_CONSEQUENCE_GATES_ENABLED']);
console.log('FLAGS:', JSON.stringify(f));
// autonomy states
const { count: autoCount } = await s.from('venture_channel_autonomy').select('*', {count:'exact', head:true}).eq('autonomy_state','autonomous');
console.log('channels currently autonomous (demotion blast radius):', autoCount);
