require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const terms = ['lane-lint','assign-fleet-identities','worker-signal.cjs','stale-session-sweep','periodic-liveness-watcher','orphan-writers-registry','lane hygiene'];
(async () => {
  console.log('--- SDs (non-terminal) whose scope/desc names a target file ---');
  const { data: sds } = await s.from('strategic_directives_v2').select('sd_key,status,current_phase,title,scope,description,updated_at')
    .not('status','in','(completed,cancelled,archived,superseded)').limit(500);
  for (const r of sds||[]) {
    const hay = `${r.scope||''} ${r.description||''} ${r.title||''}`.toLowerCase();
    const hits = terms.filter(t=>hay.includes(t.toLowerCase()));
    if (hits.length && r.sd_key !== 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001') console.log(` ${r.status}/${r.current_phase} ${r.sd_key} :: hits=[${hits}] :: ${String(r.title).slice(0,110)}`);
  }
  console.log('--- open QFs naming a target file ---');
  const { data: qfs } = await s.from('quick_fixes').select('id,status,title,description,updated_at:created_at').in('status',['open','in_progress','pending','escalated']).limit(500);
  for (const r of qfs||[]) {
    const hay = `${r.title||''} ${r.description||''}`.toLowerCase();
    const hits = terms.filter(t=>hay.includes(t.toLowerCase()));
    if (hits.length) console.log(` ${r.status} ${r.id} :: hits=[${hits}] :: ${String(r.title).slice(0,120)}`);
  }
})();
