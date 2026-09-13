import { evaluateGraduation } from '../lib/marketing/autonomy-gate.js';
import { XAdapter } from '../lib/marketing/publisher/adapters/x.js';
import { BlueskyAdapter } from '../lib/marketing/publisher/adapters/bluesky.js';
import { observeOutcome } from '../lib/marketing/observer/observe-outcome.js';

function filteringSupabase(rows) {
  return { from: (table) => {
    if (table !== 'venture_channel_publish_ledger') {
      const s = { select:()=>s, eq:()=>s, order:()=>s, limit:()=>s,
        maybeSingle:()=>Promise.resolve({data:null,error:null}), upsert:()=>Promise.resolve({error:null}) };
      return s;
    }
    const f = { venture_id:null, channel_type:null, execution_mode:null, outcomeNotIn:null };
    const c = { select:()=>c, eq:(k,v)=>{f[k]=v; return c;},
      not:(k,_o,l)=>{ if(k==='outcome') f.outcomeNotIn=l.replace(/[()]/g,'').split(','); return c; },
      order:()=>c,
      limit:(n)=>Promise.resolve({ data: rows.filter(r=>
        (f.venture_id===null||r.venture_id===f.venture_id) &&
        (f.channel_type===null||r.channel_type===f.channel_type) &&
        (f.execution_mode===null||r.execution_mode===f.execution_mode) &&
        (f.outcomeNotIn===null||!f.outcomeNotIn.includes(r.outcome))).slice(0,n), error:null }) };
    return c;
  }};
}

console.log('=== PROBE 1: mock-mode evaluateGraduation with 5 PERFECT mock rows ===');
const mockRows = Array.from({length:5},(_,i)=>({venture_id:'v-1',channel_type:'x',decision:'accepted',
  outcome:'shipped_clean',execution_mode:'mock',created_at:`2026-09-12T00:00:0${5-i}Z`}));
const r1 = await evaluateGraduation({supabase:filteringSupabase(mockRows),ventureId:'v-1',channelType:'x',requiredStreak:5,mode:'mock'});
console.log('  cleanStreak:', r1.cleanStreak, '| expected if mode filter were honoured: 5');
console.log('  VERDICT:', r1.cleanStreak===0 ? 'DEFECT CONFIRMED - mock-mode streak is ALWAYS 0' : 'ok');

console.log('\n=== PROBE 1b: mode=null/undefined (legacy NULL execution_mode row) ===');
const mixed=[{venture_id:'v-1',channel_type:'x',decision:'accepted',outcome:'shipped_clean',execution_mode:'mock',created_at:'2026-09-12T00:00:02Z'},
 {venture_id:'v-1',channel_type:'x',decision:'accepted',outcome:'shipped_clean',execution_mode:'live',created_at:'2026-09-12T00:00:01Z'}];
const r1b = await evaluateGraduation({supabase:filteringSupabase(mixed),ventureId:'v-1',channelType:'x',requiredStreak:5,mode:null});
console.log('  cleanStreak with mode=null:', r1b.cleanStreak, '(no mode filter applied -> old break-on-mock behaviour)');

console.log('\n=== PROBE 2: X getTweet on HTTP 200 with errors-only body (deleted tweet, X API v2 partial-error shape) ===');
const delBody = { errors:[{ title:'Not Found Error', detail:'Could not find tweet with id: 123',
  type:'https://api.twitter.com/2/problems/resource-not-found' }] };
const x = new XAdapter({ accessToken:'tok', fetchImpl: async()=>({ ok:true, status:200, json:async()=>delBody }) });
const r2 = await x.getTweet('123');
console.log('  result:', JSON.stringify(r2));
console.log('  VERDICT:', r2.exists===true ? 'DEFECT CONFIRMED - deleted tweet reports exists:true' : 'ok');

console.log('\n=== PROBE 2b: X getTweet on HTTP 200 with TOTALLY EMPTY body ===');
const x2 = new XAdapter({ accessToken:'tok', fetchImpl: async()=>({ ok:true, status:200, json:async()=>({}) }) });
console.log('  result:', JSON.stringify(await x2.getTweet('123')));

console.log('\n=== PROBE 2c: X getTweet on unparseable 200 body (json() throws -> raw null) ===');
const x3 = new XAdapter({ accessToken:'tok', fetchImpl: async()=>({ ok:true, status:200, json:async()=>{throw new Error('bad json');} }) });
console.log('  result:', JSON.stringify(await x3.getTweet('123')), '<- exists:true from a body it could not even parse');

console.log('\n=== PROBE 3: Bluesky getPostRecord on XRPC 400 RecordNotFound (real AT Proto deleted-record shape) ===');
const bs = new BlueskyAdapter({ fetchImpl: async()=>({ ok:false, status:400, json:async()=>({error:'RecordNotFound',message:'Could not locate record'}) }) });
const r3 = await bs.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
console.log('  result:', JSON.stringify(r3));
console.log('  VERDICT:', r3.transient===true ? 'DEFECT CONFIRMED - deleted bluesky post reads transient, never reverted' : 'ok');

console.log('\n=== PROBE 4: observeOutcome end-to-end with the PROBE-2 deleted-tweet response ===');
const sb = { from:(t)=>({ select:()=>({ eq:()=>({ maybeSingle:()=>Promise.resolve({
  data: t==='venture_channel_publish_ledger'
    ? { id:'l1', venture_id:'v-1', channel_type:'x', correlation_id:'corr-1' }
    : { id:'c1', external_post_id:'123', platform:'x' }, error:null }) }) }) }) };
class FakeX { async getTweet(){ return x.getTweet('123'); } }
const r4 = await observeOutcome({ supabase: sb, correlationId:'corr-1', adapters:{ x: FakeX } });
console.log('  result:', JSON.stringify(r4));
console.log('  VERDICT:', r4.outcome==='shipped_clean' ? 'DEFECT CONFIRMED - a DELETED post is written to the ledger as shipped_clean (feeds autonomy graduation)' : 'ok');
