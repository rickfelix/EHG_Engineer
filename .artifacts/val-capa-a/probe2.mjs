import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: v } = await sb.from('ventures').select('id').limit(1);
const vid = v[0].id;
const cats = ['npm_audit','secrets','lint','test_suite','unit_test','e2e_test','uat_test','bug_report','uat_signoff','capability','accessibility','performance','responsive','usability','journey_coherence','bogus_nonexistent'];
const ids = [];
for (const c of cats) {
  const hash = 'valprb' + Math.random().toString(16).slice(2,12);
  const { data, error } = await sb.from('venture_quality_findings').insert({ venture_id: vid, stage_number: 20, finding_category: c, severity: 'low', finding_hash: hash, evidence_pointer: { val_probe: true } }).select('id').maybeSingle();
  if (!error) { console.log(`  ${c.padEnd(20)} ACCEPTED`); ids.push(data.id); }
  else if (error.code === '23514') console.log(`  ${c.padEnd(20)} REJECTED_BY_CHECK(23514)`);
  else console.log(`  ${c.padEnd(20)} other:${error.code}:${error.message.slice(0,80)}`);
}
for (const id of ids) await sb.from('venture_quality_findings').delete().eq('id', id);
console.log('cleaned up', ids.length, 'probe rows');
const { count } = await sb.from('venture_quality_findings').select('*',{count:'exact',head:true});
console.log('rows after cleanup:', count);
