require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const g = require('../lib/coordination/lane-lint-gauge.cjs');
(async () => {
  const s = createSupabaseServiceClient();
  const { data, error } = await s.from('session_coordination')
    .select('id, sender_session, sender_type, message_type, payload, body, subject, created_at')
    .order('created_at', { ascending: false }).limit(1000);
  if (error) { console.log('ERR', error.message); return; }
  console.log('rows', data.length, 'oldest', data[data.length-1].created_at);
  console.log('totals', g.computeRowViolationCounts(data));
  const comp = {};
  for (const r of data) {
    const u = g.isUntypedRow(r), b = g.isBodylessRow(r), e = g.isEmptySenderRow(r);
    if (!u && !b && !e) continue;
    const k = [r.message_type, r.sender_type, r.payload?.kind || (r.payload?.signal_type ? 'sig:'+r.payload.signal_type : '-'), (r.subject||'').slice(0,28), u?'U':'', b?'B':'', e?'E':''].join('|');
    comp[k] = (comp[k]||0)+1;
  }
  Object.entries(comp).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(v, k));
  // sd_backlog_map + PRD
  const { data: bl } = await s.from('sd_backlog_map').select('*').eq('sd_id','SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001');
  console.log('backlog rows', (bl||[]).length);
  const { data: prd } = await s.from('product_requirements_v2').select('id,status').eq('sd_id','SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001');
  console.log('prd rows', JSON.stringify(prd));
  const { data: samp } = await s.from('session_coordination').select('sender_session').eq('sender_type','sweep').not('sender_session','is',null).limit(2);
  console.log('sweep sender_session samples', JSON.stringify(samp));
})();
