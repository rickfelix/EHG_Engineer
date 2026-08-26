import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// 1. Are there NULL attempt_number rows live?
const { count: total } = await sb.from('chairman_decisions').select('id', {count:'exact', head:true});
const { count: nulls, error: e1 } = await sb.from('chairman_decisions').select('id', {count:'exact', head:true}).is('attempt_number', null);
console.log('chairman_decisions total:', total, '| attempt_number IS NULL:', nulls, e1?.message||'');
// 2. product_review rows
const { data: pr, error: e2 } = await sb.from('chairman_decisions')
  .select('id, venture_id, lifecycle_stage, decision_type, status, attempt_number, override_key, created_at')
  .eq('decision_type','product_review').order('created_at',{ascending:false}).limit(20);
console.log('product_review rows:', pr?.length ?? 0, e2?.message||'');
for (const r of (pr||[])) console.log('  ', r.venture_id, 'stage', r.lifecycle_stage, 'attempt', r.attempt_number, 'status', r.status);
// 3. distinct decision_type + any override_key values in use
const { data: ok } = await sb.from('chairman_decisions').select('override_key, decision_type').not('override_key','is',null).limit(50);
console.log('rows with non-null override_key:', ok?.length ?? 0);
for (const r of (ok||[])) console.log('   override_key=', r.override_key, '| type=', r.decision_type);
// 4. does creative_assets.storage_path exist live?
const { error: e4 } = await sb.from('creative_assets').select('storage_path').limit(1);
console.log('creative_assets.storage_path probe:', e4 ? `${e4.code} ${e4.message}` : 'EXISTS');
// 5. ordering semantics check: NULLS FIRST on DESC
const { data: ord } = await sb.from('chairman_decisions').select('attempt_number').order('attempt_number',{ascending:false}).limit(5);
console.log('top-5 attempt_number DESC (null-placement evidence):', JSON.stringify(ord?.map(r=>r.attempt_number)));
