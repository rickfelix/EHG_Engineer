const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TOUCHED = ['dispatch.cjs','claim-eligibility','fleet-dashboard','outstanding-signals','worker-status','capped-pool','signal_receipt','signal receipt','broadcast','CONSTRAINTS','hold provenance','hold-provenance','stale-session-sweep','drain set','drain_set'];
(async () => {
  // Other SDs touching the same concepts, recently active
  const { data: sds } = await s.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,created_at,updated_at')
    .gte('updated_at','2026-08-25')
    .order('updated_at',{ascending:false}).limit(400);
  const hitSd = (sds||[]).filter(r => r.sd_key !== 'SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001' &&
    TOUCHED.some(t => (r.title||'').toLowerCase().includes(t.toLowerCase())));
  console.log('=== SDs (updated since 08-25) with overlapping title terms: ' + hitSd.length + ' of ' + (sds||[]).length + ' scanned ===');
  hitSd.forEach(r => console.log(`${r.sd_key} | ${r.status}/${r.current_phase} | upd ${r.updated_at?.slice(0,16)} | ${(r.title||'').slice(0,130)}`));

  const { data: qfs } = await s.from('quick_fixes')
    .select('id,title,status,created_at,pr_url,commit_sha,files_changed')
    .gte('created_at','2026-08-25').order('created_at',{ascending:false}).limit(400);
  const hitQf = (qfs||[]).filter(r => r.id !== 'QF-20260904-724' &&
    TOUCHED.some(t => ((r.title||'')+' '+JSON.stringify(r.files_changed||'')).toLowerCase().includes(t.toLowerCase())));
  console.log('\n=== QFs (created since 08-25) with overlapping terms: ' + hitQf.length + ' of ' + (qfs||[]).length + ' scanned ===');
  hitQf.forEach(r => console.log(`${r.id} | ${r.status} | pr=${r.pr_url? 'Y':'-'} | ${(r.title||'').slice(0,120)}`));
})().then(()=>process.exit(0));
