import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('chairman_ratifications').select('id, marker_text, encoded_at, encoded_ref, target_contracts').limit(1000);
const tcVals = new Set(); const secIds = new Set();
let withMarker=0, encoded=0;
for (const r of data) {
  if (r.marker_text) withMarker++;
  if (r.encoded_at) encoded++;
  (Array.isArray(r.target_contracts)?r.target_contracts:[]).forEach(v=>tcVals.add(String(v)));
  if (r.encoded_ref && r.encoded_ref.section_id) secIds.add(String(r.encoded_ref.section_id));
}
console.log('rows=',data.length,'withMarker=',withMarker,'encoded=',encoded);
console.log('distinct target_contracts values:', [...tcVals].sort().join(' | '));
console.log('distinct encoded_ref.section_id:', [...secIds].sort().join(', '));
console.log('sample encoded_ref:', JSON.stringify(data.find(r=>r.encoded_ref)?.encoded_ref));
