import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const REQ=['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest'];
const { data, error } = await sb.from('uat_test_runs').select('id, metadata').limit(200);
if (error) { console.error(error); process.exit(1); }
console.log('uat_test_runs rows =', data.length);
let dis=0, vacuous=0;
const shapes = new Map();
for (const r of data){
  const st = r.metadata?.control_pack_status;
  const ev = r.metadata?.control_pack_evaluated;
  const present = st && typeof st==='object' ? REQ.filter(k=>k in st) : [];
  const tight = present.length===4 && REQ.every(k=>st[k] !== 'not_attempted');
  const loose = st && typeof st==='object' ? REQ.every(k=>st[k] !== 'not_attempted') : false;
  if (tight !== loose) vacuous++;
  if (ev !== undefined && !!ev !== tight) { dis++; console.log('  DISAGREE', r.id.slice(0,8), 'stored=',ev,'tight=',tight,'present=',present.length); }
  if (st) for (const k of Object.keys(st)) shapes.set(st[k], (shapes.get(st[k])||0)+1);
}
console.log('rows where tightened predicate DIFFERS from loose (absent-key vacuous cases) =', vacuous);
console.log('rows where stored control_pack_evaluated disagrees with tightened predicate =', dis);
console.log('distinct control_pack_status VALUES seen live:', [...shapes.entries()].map(([k,v])=>`${JSON.stringify(k)}x${v}`).join(', '));
