import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: v } = await sb.from('ventures').select('*').ilike('name','AltifyAI').maybeSingle();
console.log('AltifyAI id:', v?.id, '| status:', v?.status, '| lifecycle_stage:', v?.current_lifecycle_stage, '| launch_mode:', v?.launch_mode, '| autonomy_level:', v?.autonomy_level);
console.log('growth_strategy:', JSON.stringify(v?.growth_strategy)?.slice(0,600));
console.log('target_market:', (v?.target_market||'').slice(0,200));
console.log('\n--- metadata channel-ish keys ---');
const md = v?.metadata||{};
Object.entries(md).forEach(([k,val])=>{ if(/channel|platform|distrib|social|thesis/i.test(k)) console.log(' ', k, '=', JSON.stringify(val).slice(0,400)); });
console.log('metadata keys:', Object.keys(md).join(', ').slice(0,500));

console.log('\n=== per-venture rows for AltifyAI ===');
for (const [t,col] of [['channel_budgets','venture_id'],['venture_channel_publish_ledger','venture_id'],['venture_channel_autonomy','venture_id'],['venture_channel_secrets','venture_id'],['venture_demand_verdicts','venture_id']]) {
  const { data, error } = await sb.from(t).select('*').eq(col, v.id);
  console.log(`  ${t}: ${error? 'ERR '+error.code : 'rows='+data.length}`);
}
