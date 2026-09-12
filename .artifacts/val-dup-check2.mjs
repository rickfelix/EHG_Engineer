import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { count: sdTotal } = await sb.from('strategic_directives_v2').select('*',{count:'exact',head:false}).limit(1);
const { count: qfTotal } = await sb.from('quick_fixes').select('*',{count:'exact',head:false}).limit(1);
console.log(`TOTALS: SDs=${sdTotal} QFs=${qfTotal} (prior scan capped at 1000 -> server-side search below)`);

const pats = ['%pre-commit%','%precommit%','%secret%','%MERGE_HEAD%','%merge commit%','%merge-commit%','%husky%'];
const orStr = (cols) => pats.flatMap(p => cols.map(c => `${c}.ilike.${p}`)).join(',');

console.log('\n=== SD server-side (title/sd_key/id) ===');
const { data: sds, error: e1 } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,created_at')
  .or(orStr(['title','sd_key'])).order('created_at',{ascending:false}).limit(200);
if (e1) console.log('ERR', e1.message);
else sds.forEach(h => console.log(`${h.sd_key||h.id} | ${h.status}/${h.current_phase} | ${h.created_at?.slice(0,10)} | ${h.title}`)), console.log(`hits=${sds?.length}`);

console.log('\n=== QF server-side (title) ===');
const { data: qfs, error: e2 } = await sb.from('quick_fixes')
  .select('id,title,status,disposition,created_at')
  .or(orStr(['title'])).order('created_at',{ascending:false}).limit(200);
if (e2) console.log('ERR', e2.message);
else qfs.forEach(h => console.log(`${h.id} | ${h.status}/${h.disposition||'-'} | ${h.created_at?.slice(0,10)} | ${h.title}`)), console.log(`hits=${qfs?.length}`);

console.log('\n=== escalation source QF-20260911-880 ===');
const { data: src } = await sb.from('quick_fixes').select('*').eq('id','QF-20260911-880').maybeSingle();
if (!src) console.log('NOT FOUND'); else console.log(`status=${src.status} disposition=${src.disposition} | ${src.title}\nescalated_to=${src.escalated_to_sd_id||src.metadata?.escalated_to||'-'}`);
