import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: one, error: e0 } = await sb.from('ventures').select('*').limit(1);
console.log('ventures cols:', e0 ? 'ERR '+e0.message : Object.keys(one[0]||{}).join(', '));
const stageCol = ['current_stage','stage','workflow_stage','lifecycle_stage'].find(c=>Object.keys(one?.[0]||{}).includes(c));
console.log('stage col detected:', stageCol);
const { data: all, error } = await sb.from('ventures').select(`id,name,status${stageCol?','+stageCol:''}`);
console.log('error:', error?error.message:'none', '| total ventures:', all?.length);
console.log('\n=== AltifyAI match ===');
(all||[]).filter(v=>/altify/i.test(v.name||'')).forEach(v=>console.log('  ', v.id.slice(0,8), v.name, '| status:', v.status, '| stage:', stageCol?v[stageCol]:'?'));
console.log('\n=== ventures behind ledger/budget rows ===');
['6dfa21c7','74f0b6a9','6f7d4afa','57631950'].forEach(p=>{
  const v=(all||[]).find(x=>x.id?.startsWith(p));
  console.log('  ', p, v? `${v.name} | status:${v.status} | stage:${stageCol?v[stageCol]:'?'}` : 'NOT FOUND in ventures');
});
