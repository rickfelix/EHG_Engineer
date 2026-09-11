import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TERMINAL = new Set(['completed','cancelled','archived','superseded']);
const terms = ['journey walk','journey-walk','stage-23','stage 23','venture telemetry','error capture','error-capture','wrangler','cloudflare','altifyai','captured_cause','venture_error','venture error','observability','worker log','secret put','troubleshoot','lib/apa','lib/uat','walker','provenance','evidence_hash','content hash','completion-ready','deploy workflow'];
const seen = new Map();
for (const t of terms) for (const col of ['title','description']) {
  const { data, error } = await sb.from('strategic_directives_v2')
    .select('id,sd_key,title,status,current_phase,target_application,priority,created_at,parent_sd_id,is_working_on')
    .ilike(col, `%${t}%`).limit(100);
  if (error) { console.error('ERR', t, col, error.message); continue; }
  for (const r of (data||[])) {
    if (TERMINAL.has(String(r.status||'').toLowerCase())) continue;
    const k = r.sd_key || r.id;
    if (!seen.has(k)) seen.set(k, { ...r, hits: new Set() });
    seen.get(k).hits.add(t);
  }
}
const rows=[...seen.values()].map(r=>({...r,hits:[...r.hits]}));
rows.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
console.log('=== NON-TERMINAL MATCHES:', rows.length, '===');
for (const r of rows) {
  console.log(`${r.sd_key||r.id} | ${r.status} | ${r.current_phase||'-'} | app=${r.target_application||'-'} | ${(r.created_at||'').slice(0,10)} | wo=${r.is_working_on?'Y':'-'} | parent=${r.parent_sd_id?'Y':'-'}`);
  console.log(`   ${String(r.title||'').slice(0,170)}`);
  console.log(`   hits: ${r.hits.join(', ')}`);
}
