require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const g = require('../lib/coordination/lane-lint-gauge.cjs');
(async () => {
  const s = createSupabaseServiceClient();
  const result = await g.runLaneLintGauge(s, {});
  console.log('GAUGE RESULT (its own 24h window):', JSON.stringify(result));

  // Full attribution over the same 24h window the gauge itself uses.
  const since = new Date(Date.now() - 24*60*60*1000).toISOString();
  let all = [];
  let last = null;
  for (let i=0;i<3;i++) {
    let q = s.from('session_coordination').select('id, sender_session, sender_type, message_type, payload, body, subject, created_at').gte('created_at', since).order('id',{ascending:true}).limit(1000);
    if (last) q = q.gt('id', last);
    const { data, error } = await q;
    if (error) { console.log('ERR', error.message); break; }
    if (!data || !data.length) break;
    all = all.concat(data);
    last = data[data.length-1].id;
    if (data.length < 1000) break;
  }
  console.log('fetched rows (paginated, id-order):', all.length);
  const comp = {};
  for (const r of all) {
    const u = g.isUntypedRow(r), b = g.isBodylessRow(r), e = g.isEmptySenderRow(r);
    if (!u && !b && !e) continue;
    const k = [r.message_type, r.sender_type, r.payload?.kind || (r.payload?.signal_type ? 'sig:'+r.payload.signal_type : '-')].join('|');
    comp[k] = (comp[k]||0)+1;
  }
  const sorted = Object.entries(comp).sort((a,b)=>b[1]-a[1]);
  console.log('total violating rows (any class):', sorted.reduce((n,[,v])=>n+v,0), 'of', all.length);
  sorted.forEach(([k,v])=>console.log(v, k));
})();
