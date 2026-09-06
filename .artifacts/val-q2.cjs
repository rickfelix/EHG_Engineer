require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const terms = ['lane-lint','lane_lint','assign-fleet-identities','worker-signal','stale-session-sweep','periodic-liveness-watcher','sender_session','lane hygiene','orphan-writers'];
(async () => {
  const { data: sds } = await s.from('strategic_directives_v2')
    .select('id,sd_key,title,status,current_phase,created_at,updated_at')
    .not('status','in','(completed,cancelled,archived,superseded)')
    .order('created_at',{ascending:false}).limit(400);
  console.log('OPEN SD COUNT', (sds||[]).length);
  for (const r of sds||[]) {
    const hay = `${r.sd_key} ${r.title}`.toLowerCase();
    if (terms.some(t => hay.includes(t.toLowerCase())) || /lane|coordination|signal|liveness|sweep|identit/.test(hay)) {
      console.log(`  ${r.status.padEnd(11)} ${r.current_phase||'-'} ${r.sd_key} :: ${String(r.title).slice(0,140)}`);
    }
  }
  console.log('\n=== ADJACENT ITEMS ===');
  for (const k of ['QF-20260904-935','QF-20260904-695']) {
    const { data } = await s.from('quick_fixes').select('*').eq('qf_key',k);
    if (data && data[0]) { const r=data[0]; console.log(k, '| status=',r.status,'| holder=',r.claimed_by||r.session_id,'| pr=',r.pr_url,'| sha=',r.commit_sha,'| disposition=',r.disposition,'|', String(r.title||r.description||'').slice(0,220)); }
    else console.log(k,'NOT FOUND in quick_fixes');
  }
  const { data: rec } = await s.from('strategic_directives_v2').select('sd_key,status,current_phase,title,scope,updated_at').eq('sd_key','SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001');
  if (rec&&rec[0]) { console.log('RECEIPTS SD status=',rec[0].status,rec[0].current_phase,rec[0].updated_at); console.log(' title:',String(rec[0].title).slice(0,250)); console.log(' scope:',String(rec[0].scope||'').slice(0,900)); }
  else console.log('RECEIPTS SD NOT FOUND');
})();
