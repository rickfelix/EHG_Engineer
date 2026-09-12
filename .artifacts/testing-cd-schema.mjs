import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('chairman_decisions').select('*').limit(1);
console.log('chairman_decisions err:', error?.message || 'none');
console.log('columns:', data && data[0] ? Object.keys(data[0]).join(', ') : '(no rows — probing individually)');
for (const c of ['override_key','decision_type','venture_id','consumed_at','undo_deadline']) {
  const { error: e } = await sb.from('chairman_decisions').select(c).limit(1);
  console.log(`  ${c}: ${e ? 'MISSING -> '+e.message.slice(0,80) : 'EXISTS'}`);
}
const { count } = await sb.from('chairman_decisions').select('*', { count: 'exact', head: true });
console.log('row count:', count);
// does any stage_gate_override row exist anywhere?
const { data: sgo, error: se } = await sb.from('chairman_decisions').select('id').eq('decision_type','stage_gate_override').limit(5);
console.log('stage_gate_override rows:', se ? 'ERR '+se.message.slice(0,70) : (sgo?.length ?? 0));
