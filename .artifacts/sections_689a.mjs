import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const m = JSON.parse(fs.readFileSync('scripts/section-file-mapping.json','utf8'));
for (const f of ['CLAUDE_ADAM.md','CLAUDE_ADAM_MANUAL.md','CLAUDE_ADAM_PROVENANCE.md','CLAUDE_EXEC.md','CLAUDE_CORE.md']) {
  const types = m[f].sections;
  const { data, error } = await sb.from('leo_protocol_sections').select('id,section_type,title,content,order_index,protocol_id').in('section_type', types).order('order_index');
  if (error) { console.log(f, 'ERR', error.message); continue; }
  let total = 0;
  console.log(`===== ${f}  rows=${data.length}`);
  for (const r of data) { const len = (r.content||'').length; total += len; console.log(`  ${String(r.id).padEnd(6)} ${String(len).padStart(6)}  ${r.section_type.padEnd(42)} ${(r.title||'').slice(0,60)}`); }
  console.log(`  TOTAL chars=${total}  ~tokens=${Math.round(total/2.4177)}`);
}
