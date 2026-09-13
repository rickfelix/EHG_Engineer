import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('\n=== ALL channel_budgets rows (full) ===');
const { data: cb } = await sb.from('channel_budgets').select('*');
console.log('count:', cb?.length);
(cb||[]).forEach(r=>console.log('  ', JSON.stringify({venture:r.venture_id?.slice(0,8), platform:r.platform, status:r.status, month:r.monthly_budget_cents, spent:r.current_month_spend_cents})));
console.log('distinct platforms:', [...new Set((cb||[]).map(r=>r.platform))].join(', '));
console.log('\n=== ventures (name search broad) ===');
for (const q of ['altify','Altify','ALTIFY']) {
  const { data } = await sb.from('ventures').select('id,name,current_workflow_stage,status').ilike('name',`%${q}%`);
  if (data?.length) data.forEach(x=>console.log('  ', x.id?.slice(0,8), x.name, '| stage:', x.current_workflow_stage, '| status:', x.status));
}
const ids = ['6dfa21c7','74f0b6a9','6f7d4afa','57631950'];
console.log('\n=== ventures behind the ledger/budget rows ===');
const { data: allv } = await sb.from('ventures').select('id,name,current_workflow_stage,status');
(allv||[]).filter(v=>ids.some(p=>v.id?.startsWith(p))).forEach(v=>console.log('  ', v.id.slice(0,8), v.name, '| stage:', v.current_workflow_stage, '| status:', v.status));
console.log('total ventures:', allv?.length);
