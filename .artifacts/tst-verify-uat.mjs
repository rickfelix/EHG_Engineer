import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.from('uat_test_runs').select('*').order('created_at',{ascending:false});
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('TOTAL uat_test_runs ROWS:', data.length);
console.log('TOP-LEVEL COLUMNS:', Object.keys(data[0]||{}).join(', '));
const REQ = ['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest'];
let hasStatus=0, hasEval=0, hasFail=0;
const rows=[];
for (const r of data) {
  const m = r.metadata || {};
  const cps = m.control_pack_status;
  const cpe = m.control_pack_evaluated;
  const cpf = m.control_pack_failures;
  if (cps!==undefined) hasStatus++;
  if (cpe!==undefined) hasEval++;
  if (cpf!==undefined) hasFail++;
  // compute the PRD's corrected predicate
  let derived=null;
  if (cps && typeof cps==='object' && !Array.isArray(cps)) {
    derived = REQ.every(k => cps[k]!==undefined && cps[k]!==null && cps[k]!=='not_attempted');
  }
  rows.push({id:(r.id||'').slice(0,8), created:(r.created_at||'').slice(0,19), cpe, cpf: cpf===undefined?'ABSENT':JSON.stringify(cpf).slice(0,40), cpsKeys: cps?Object.keys(cps).join('|'):'ABSENT', derived, AGREE: (cpe===derived)});
}
console.log('rows with control_pack_status key:', hasStatus, '| control_pack_evaluated key:', hasEval, '| control_pack_failures key:', hasFail);
console.table(rows);
const disagree = rows.filter(r=>r.cpe!==undefined && r.derived!==null && r.cpe!==r.derived);
console.log('\nDISAGREEMENTS (existing cpe vs corrected predicate):', disagree.length);
console.log(JSON.stringify(disagree,null,2));
const evalFalse = rows.filter(r=>r.cpe===false).length;
const evalTrue = rows.filter(r=>r.cpe===true).length;
console.log('cpe=false count:', evalFalse, '| cpe=true count:', evalTrue);
