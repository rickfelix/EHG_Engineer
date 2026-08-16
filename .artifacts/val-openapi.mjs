import dotenv from 'dotenv'; dotenv.config();
const URL=process.env.SUPABASE_URL, ANON=process.env.SUPABASE_ANON_KEY, SVC=process.env.SUPABASE_SERVICE_ROLE_KEY;
async function rpcs(key,label){
  const r=await fetch(`${URL}/rest/v1/`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/openapi+json'}});
  if(!r.ok){console.log(`${label}: HTTP ${r.status}`);return null;}
  const j=await r.json();
  const s=new Set(Object.keys(j.paths||{}).filter(p=>p.startsWith('/rpc/')).map(p=>p.slice(5)));
  console.log(`${label}: ${s.size} RPC(s) visible`);
  return s;
}
const a=await rpcs(ANON,'anon    '); const sv=await rpcs(SVC,'service ');
if(!a){process.exit(1);}
// two-sided sanity: things we PROVED callable must appear; things we PROVED 42501 must not
console.log('\nSANITY (instrument two-sidedness):');
for(const f of ['fn_is_chairman','is_leo_admin','lhe_pending_migration_applied','get_daily_briefing','get_okr_metrics','get_portfolio_summary'])
  console.log(`  proven-200  ${f.padEnd(34)} in anon spec: ${a.has(f)}`);
console.log('\nROLE-FLAG RPCs (the SD\'s claimed "4 of 46 closed", migration is on an UNMERGED branch):');
for(const f of ['set_coordinator_flag','clear_coordinator_flag','set_solomon_flag','clear_solomon_flag'])
  console.log(`  ${f.padEnd(34)} anon-visible: ${a.has(f)}   service-visible: ${sv?sv.has(f):'?'}`);
