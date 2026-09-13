import { evaluateGraduation } from '../lib/marketing/autonomy-gate.js';
function fake(rows, sink) {
  return { from: (t) => {
    if (t === 'venture_channel_autonomy') return { upsert: (row) => { sink.push(row); return Promise.resolve({ error: null }); } };
    if (t !== 'venture_channel_publish_ledger') {
      const s = { select:()=>s, eq:()=>s, order:()=>s, limit:()=>s, maybeSingle:()=>Promise.resolve({data:null,error:null}) }; return s;
    }
    const f = { venture_id:null, channel_type:null, execution_mode:null, outcomeNotIn:null };
    const c = { select:()=>c, eq:(k,v)=>{f[k]=v; return c;},
      not:(k,_o,l)=>{ if(k==='outcome') f.outcomeNotIn=l.replace(/[()]/g,'').split(','); return c; },
      order:()=>c,
      limit:(n)=>Promise.resolve({ data: rows.filter(r=>
        (f.execution_mode===null||r.execution_mode===f.execution_mode) &&
        (f.outcomeNotIn===null||!f.outcomeNotIn.includes(r.outcome))).slice(0,n), error:null }) };
    return c;
  }};
}
const mixed = [
  { venture_id:'v-1', channel_type:'x', decision:'accepted', outcome:'shipped_clean', execution_mode:'mock', created_at:'2026-09-12T00:00:02Z' },
  { venture_id:'v-1', channel_type:'x', decision:'accepted', outcome:'shipped_clean', execution_mode:'live', created_at:'2026-09-12T00:00:01Z' },
];
for (const mode of ['mock', 'live', null, undefined, 'dry_run']) {
  const sink = [];
  const r = await evaluateGraduation({ supabase: fake(mixed, sink), ventureId:'v-1', channelType:'x', requiredStreak:5, mode });
  console.log(`mode=${JSON.stringify(mode)} -> streak=${r.cleanStreak} autonomy_upserts=${sink.length}` +
    (sink.length ? ` WROTE autonomy_state='${sink[0].autonomy_state}' clean_streak=${sink[0].clean_streak}` : ' (no write)'));
}
console.log('\n^^ any row with autonomy_upserts=1 and autonomy_state=propose_and_approve DEMOTES a live-graduated channel.');
