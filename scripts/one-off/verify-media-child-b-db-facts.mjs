import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. STAGE_GATE_PREDICATE_ARMED flag
const ff = await s.from('leo_feature_flags').select('*').eq('flag_key','STAGE_GATE_PREDICATE_ARMED');
console.log('[1] leo_feature_flags STAGE_GATE_PREDICATE_ARMED ->', ff.error ? ('ERR '+ff.error.message) : `rows=${ff.data.length}`, JSON.stringify(ff.data));
const ff2 = await s.from('leo_feature_flags').select('flag_key').ilike('flag_key','%STAGE_GATE%');
console.log('[1b] any STAGE_GATE-ish flags ->', ff2.error ? ('ERR '+ff2.error.message) : JSON.stringify(ff2.data));

// 2. chairman_decisions column names
const cd = await s.from('chairman_decisions').select('*').eq('decision_type','product_review').limit(2);
console.log('[2] chairman_decisions product_review sample err=', cd.error?.message, 'rows=', cd.data?.length);
if (cd.data?.[0]) console.log('[2] COLUMNS:', JSON.stringify(Object.keys(cd.data[0])));
const cdAny = await s.from('chairman_decisions').select('*').limit(1);
if (cdAny.data?.[0]) console.log('[2b] chairman_decisions COLUMNS(any row):', JSON.stringify(Object.keys(cdAny.data[0])));

// 2c. does a lifecycle_stage column exist? probe both names
for (const col of ['lifecycle_stage','stage_number','stage']) {
  const p = await s.from('chairman_decisions').select(`id,${col}`).limit(1);
  console.log(`[2c] chairman_decisions.${col} ->`, p.error ? 'ABSENT/ERR: '+p.error.message : 'PRESENT');
}

// 2d. status values in use for product_review
const st = await s.from('chairman_decisions').select('status,decision,venture_id').eq('decision_type','product_review').limit(50);
console.log('[2d] product_review status/decision spread:', st.error?.message || JSON.stringify(st.data));

// 3. creative_assets live?
const ca = await s.from('creative_assets').select('*').limit(1);
console.log('[3] creative_assets ->', ca.error ? 'NOT LIVE / ERR: '+ca.error.message : `LIVE rows=${ca.data.length} cols=${ca.data[0]?JSON.stringify(Object.keys(ca.data[0])):'(empty table)'}`);

// 4. storage buckets
const b = await s.storage.listBuckets();
console.log('[4] buckets ->', b.error ? 'ERR '+b.error.message : JSON.stringify((b.data||[]).map(x=>({name:x.name,public:x.public}))));
