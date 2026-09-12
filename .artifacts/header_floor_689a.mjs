import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('chairman_ratifications').select('id,marker_text,encoded_ref').not('marker_text','is',null);
const markers = data.filter(r => String(r.encoded_ref?.section_id)==='601').map(r=>({id:r.id.slice(0,8), m:r.marker_text.trim()}));
const lines = fs.readFileSync('.artifacts/adam-after-601.md','utf8').split('\n');
let inS = false, hdrTotal = 0, bodyTotal = 0, n = 0, mkTotal = 0, longer = [];
for (const l of lines) {
  if (l.startsWith('### 5s.')) { inS = true; continue; }
  if (!inS || !l.startsWith('- **')) continue;
  n++;
  const end = l.indexOf('** —');
  const hdr = end > 0 ? l.slice(0, end + 2) : l;
  hdrTotal += Buffer.byteLength(hdr); bodyTotal += Buffer.byteLength(l) - Buffer.byteLength(hdr);
  const ms = markers.filter(x => l.includes(x.m));
  const mk = ms.reduce((a,x)=>Math.max(a, Buffer.byteLength(x.m)), 0);
  mkTotal += mk;
  if (Buffer.byteLength(hdr) - mk > 120) longer.push(`${Buffer.byteLength(hdr)} hdr vs ${mk} marker :: ${hdr.slice(0,80)}`);
}
console.log({ bullets: n, hdrTotal, bodyTotal, markerFloor: mkTotal });
console.log(longer.join('\n'));
