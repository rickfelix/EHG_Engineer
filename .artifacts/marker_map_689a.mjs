import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('chairman_ratifications').select('id,marker_text,encoded_ref').not('marker_text','is',null);
const rows = data.filter(r => String(r.encoded_ref?.section_id) === '601');
const lines = fs.readFileSync('CLAUDE_ADAM.md','utf8').split('\n');
const out = [];
for (const r of rows) {
  let line = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(r.marker_text)) { line = i + 1; break; }
  out.push({ id: r.id.slice(0,8), line, mlen: r.marker_text.length, lineLen: line>0 ? lines[line-1].length : 0, m: r.marker_text.slice(0,90).replace(/\n/g,' ') });
}
out.sort((a,b)=>a.line-b.line);
console.log('markers for 601:', rows.length);
for (const o of out) console.log(`L${String(o.line).padStart(4)} mlen=${String(o.mlen).padStart(4)} lineLen=${String(o.lineLen).padStart(5)} ${o.id} ${o.m}`);
