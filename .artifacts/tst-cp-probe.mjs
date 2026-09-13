import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r = await s.from('uat_test_runs').select('id,created_at,metadata').order('created_at',{ascending:false});
let present=0, absent=0, jnull=0, drift=0;
for (const row of r.data) {
  const m = row.metadata || {};
  const hasFailKey = Object.prototype.hasOwnProperty.call(m,'control_pack_failures');
  const hasEvalKey = Object.prototype.hasOwnProperty.call(m,'control_pack_evaluated');
  const f = m.control_pack_failures;
  const e = m.control_pack_evaluated;
  const shape = !hasFailKey ? 'KEY_ABSENT' : (f===null ? 'JSON_NULL' : (Array.isArray(f)? `ARRAY(${f.length})` : typeof f));
  if (!hasFailKey) absent++; else present++;
  if (hasFailKey && f===null) jnull++;
  const derived = hasFailKey && f!==null;
  if (Boolean(e) !== derived) drift++;
  console.log(`${row.id.slice(0,8)} ${row.created_at.slice(0,16)} failures=${shape} evaluated=${JSON.stringify(e)}${hasEvalKey?'':' (EVAL_KEY_ABSENT)'} ${Boolean(e)!==derived?'<-- DRIFT':''}`);
}
console.log(`\nTOTAL=${r.data.length} failuresKeyPresent=${present} absent=${absent} jsonNull=${jnull} drift(vs proposed predicate)=${drift}`);
