import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2').select('*').eq('sd_key','SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.log('NO ROW by sd_key'); process.exit(0); }
const keys = ['id','sd_key','title','status','current_phase','priority','parent_sd_id','progress','target_application','created_at','updated_at'];
for (const k of keys) console.log(k, '=', JSON.stringify(data[k]));
console.log('--- description ---'); console.log(data.description);
console.log('--- scope ---'); console.log(data.scope);
console.log('--- strategic_objectives ---'); console.log(JSON.stringify(data.strategic_objectives));
console.log('--- success_criteria ---'); console.log(JSON.stringify(data.success_criteria));
console.log('--- acceptance_criteria ---'); console.log(JSON.stringify(data.acceptance_criteria));
console.log('--- dependencies ---'); console.log(JSON.stringify(data.dependencies));
console.log('--- metadata ---'); console.log(JSON.stringify(data.metadata, null, 1).slice(0, 8000));
