import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const q = await s.from('feedback').select('quality_score').limit(1);
console.log('quality_score select:', q.error ? 'ERROR: '+q.error.message : 'OK -> column exists');
const r = await s.from('feedback').select('id,rubric_score,status').limit(1);
console.log('rubric_score select:', r.error ? 'ERROR: '+r.error.message : 'OK');
// how many rows would the newly-live gate block?
const low = await s.from('feedback').select('id', {count:'exact', head:true}).lt('rubric_score',40).not('rubric_score','is',null);
console.log('rows with rubric_score < 40:', low.error? low.error.message : low.count);
const nn = await s.from('feedback').select('id', {count:'exact', head:true}).not('rubric_score','is',null);
console.log('rows with rubric_score NOT NULL:', nn.error? nn.error.message : nn.count);
// live marker counts (FR-8 baseline drift check)
const wp = await s.from('feedback').select('id', {count:'exact', head:true}).not('metadata->withheld_pending','is',null);
console.log('metadata.withheld_pending rows:', wp.error? wp.error.message : wp.count);
const pq = await s.from('feedback').select('id', {count:'exact', head:true}).not('metadata->promoted_to_qf','is',null);
console.log('metadata.promoted_to_qf rows:', pq.error? pq.error.message : pq.count);
// does withheld_promotion_markers already exist?
const w = await s.from('withheld_promotion_markers').select('feedback_id', {count:'exact', head:true});
console.log('withheld_promotion_markers:', w.error ? 'ABSENT/ERR: '+w.error.message : 'EXISTS count='+w.count);
