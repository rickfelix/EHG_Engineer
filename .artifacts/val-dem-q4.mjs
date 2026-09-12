import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== leo_feature_flags: stage/high-consequence related ===');
const { data: ff, error: ffe } = await sb.from('leo_feature_flags').select('*');
console.log('err:', ffe?.message||'none', 'total flags:', ff?.length);
for (const f of (ff||[])) {
  const k = f.flag_key || f.key || f.name || JSON.stringify(Object.keys(f));
  if (/STAGE|HIGH_CONSEQ|GATE|PUBLISH|MARKET|CANARY|THESIS/i.test(k)) {
    console.log(' -', JSON.stringify(f));
  }
}
console.log('\n--- exact STAGE_GATE_PREDICATE_ARMED present? ---');
console.log((ff||[]).filter(f => (f.flag_key||f.key||'') === 'STAGE_GATE_PREDICATE_ARMED').length ? 'PRESENT' : 'ABSENT');
console.log('\n--- all flag keys ---');
console.log((ff||[]).map(f=>`${f.flag_key||f.key}=${f.enabled ?? f.is_enabled ?? '?'}`).join('\n'));

console.log('\n\n=== STAGE-WRITER-CHOKE-001 ===');
const { data: choke } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,updated_at').eq('sd_key','SD-LEO-INFRA-STAGE-WRITER-CHOKE-001').maybeSingle();
console.log(JSON.stringify(choke,null,1));

console.log('\n=== child rows by parent_sd_id (authoritative) ===');
const { data: kids } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase').eq('parent_sd_id','c6c645c6-2f94-41b6-8e80-2642d7fcdc23');
for (const k of (kids||[])) console.log(` - ${k.id} | ${k.sd_key} | ${k.status} | ${k.current_phase}`);
console.log('\n--- does uuid b78ef2a5-10a6-475d-824e-9b3264c96489 exist? ---');
const { data: b78 } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,parent_sd_id').eq('id','b78ef2a5-10a6-475d-824e-9b3264c96489').maybeSingle();
console.log(b78 ? JSON.stringify(b78,null,1) : 'NO SUCH ROW (parent metadata.children uuid is stale/wrong)');

console.log('\n=== any OTHER SD whose metadata mentions DEMAND-ENGINE-FAIL ===');
const { data: refs } = await sb.from('strategic_directives_v2').select('id,sd_key,status,current_phase,title').ilike('metadata','%DEMAND-ENGINE-FAIL%');
console.log('ilike-on-jsonb result err-tolerant:', JSON.stringify((refs||[]).map(r=>`${r.sd_key}|${r.status}`),null,1));
