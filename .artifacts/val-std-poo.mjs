import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== standing OBSERVABILITY acceptance SD ===');
const { data: obs } = await sb.from('strategic_directives_v2').select('sd_key,status,description')
  .eq('sd_key','SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001').maybeSingle();
console.log(obs?.status, '|', (obs?.description||'').slice(0,700));

console.log('\n=== dependency SDs status ===');
for (const k of ['SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001','SD-LEO-INFRA-DEMAND-ENGINE-PART-001']) {
  const { data } = await sb.from('strategic_directives_v2').select('sd_key,status,current_phase,progress').eq('sd_key',k).maybeSingle();
  console.log(' ', k, '=>', data?.status, data?.current_phase, 'progress:', data?.progress);
}

console.log('\n=== QF dedup (quick fixes mentioning observe/outcome/publish ledger) ===');
const { data: qf, error: eq } = await sb.from('quick_fixes').select('qf_key,title,status,created_at').order('created_at',{ascending:false}).limit(400);
if (eq) console.log('ERR', eq.code, eq.message);
else {
  const hits = (qf||[]).filter(q=>/observ|publish.?outcome|graduat|ledger.?outcome|recordPublish/i.test(q.title||''));
  console.log('scanned', qf.length, 'QFs; hits:', hits.length);
  hits.forEach(q=>console.log('  ', q.status.padEnd(10), q.qf_key, '|', (q.title||'').slice(0,95)));
}
