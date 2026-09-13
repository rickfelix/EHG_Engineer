import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Which categories does the LIVE constraint accept? probe-insert each
const cats = ['npm_audit','secrets','lint','test_suite','unit_test','e2e_test','uat_test','bug_report','uat_signoff','capability','accessibility','performance','responsive','usability','journey_coherence','bogus_nonexistent'];
const results = {};
for (const c of cats) {
  const probe = { venture_id: '00000000-0000-0000-0000-000000000000', stage_number: 20, finding_category: c, severity: 'low', finding_signature: 'val-probe-'+c, finding_hash: 'valprobe'+Date.now()+c, evidence_pointer: {} };
  const { error } = await sb.from('venture_quality_findings').insert(probe).select('id').maybeSingle();
  if (!error) { results[c] = 'ACCEPTED(inserted)'; }
  else if (error.code === '23514') results[c] = 'REJECTED_BY_CHECK(23514)';
  else results[c] = `other:${error.code}:${error.message.slice(0,90)}`;
}
console.log('--- LIVE CONSTRAINT PROBE ---');
for (const [k,v] of Object.entries(results)) console.log(`  ${k.padEnd(20)} ${v}`);
await sb.from('venture_quality_findings').delete().like('finding_signature','val-probe-%');

// 2. Actual findings for AltifyAI
const { data: v } = await sb.from('ventures').select('id,name,deployment_url').ilike('name','%altify%');
console.log('\n--- VENTURES ---', JSON.stringify(v));
if (v && v.length) {
  const { data: f, error: fe } = await sb.from('venture_quality_findings')
    .select('id,finding_category,severity,finding_signature,status,created_at')
    .in('venture_id', v.map(x=>x.id))
    .in('finding_category',['accessibility','performance','responsive'])
    .order('created_at',{ascending:false});
  console.log('--- BASELINE FINDINGS for AltifyAI:', fe ? fe.message : (f?.length||0));
  for (const r of (f||[]).slice(0,30)) console.log(`   ${r.created_at} ${r.finding_category} ${r.severity} ${r.finding_signature} status=${r.status}`);
}
// 3. any baseline-category findings at all
const { data: anyf } = await sb.from('venture_quality_findings').select('venture_id,finding_category,severity,created_at,finding_signature').in('finding_category',['accessibility','performance','responsive']).order('created_at',{ascending:false}).limit(20);
console.log('\n--- ANY baseline-category findings repo-wide:', anyf?.length||0);
for (const r of (anyf||[])) console.log(`   ${r.created_at} ${r.finding_category} ${r.severity} ${r.finding_signature}`);
