import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const col of ['storage_path','consumed_at','venture_id','provenance']) {
  const p = await s.from('creative_assets').select(`id,${col}`).limit(1);
  console.log(`creative_assets.${col} ->`, p.error ? 'ABSENT: '+p.error.message : 'PRESENT');
}
// demo ventures that would hit rule (c)
const d = await s.from('ventures').select('id,is_demo,current_lifecycle_stage', {count:'exact', head:false}).eq('is_demo', true).limit(3);
console.log('is_demo=true ventures ->', d.error?.message || `count=${d.data.length}`, JSON.stringify(d.data));
// approved product_review rows w/ deleted_at
const pr = await s.from('chairman_decisions').select('id,venture_id,status,decision,attempt_number,deleted_at,lifecycle_stage').eq('decision_type','product_review');
console.log('ALL product_review rows:', JSON.stringify(pr.data, null, 1));
