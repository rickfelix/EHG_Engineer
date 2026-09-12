import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('chairman_ratifications').select('id, marker_text, encoded_at, encoded_ref, target_contracts').limit(1000);
const files = ['CLAUDE_ADAM.md','CLAUDE_ADAM_PROVENANCE.md','CLAUDE_ADAM_MANUAL.md','CLAUDE.md','CLAUDE_CORE.md','CLAUDE_LEAD.md','CLAUDE_EXEC.md','CLAUDE_SOLOMON.md','CLAUDE_SOLOMON_PROVENANCE.md','CLAUDE_COORDINATOR.md','CLAUDE_COORDINATOR_PROVENANCE.md'];
const c = {}; files.forEach(f => c[f] = existsSync(f) ? readFileSync(f,'utf8') : null);
const rows = data.filter(r => r.marker_text && r.encoded_ref && String(r.encoded_ref.section_id) === '601');
console.log('section_id=601 (CLAUDE_ADAM.md) rows with marker_text:', rows.length);
let ok=0; const miss=[];
for (const r of rows) {
  if (c['CLAUDE_ADAM.md'].includes(r.marker_text)) ok++;
  else miss.push({ id: String(r.id).slice(0,8), elsewhere: files.filter(f=>c[f]&&c[f].includes(r.marker_text)), m: r.marker_text.slice(0,70) });
}
console.log('PRESENT in CLAUDE_ADAM.md:', ok, ' MISSING:', miss.length);
miss.forEach(x=>console.log('  MISS', x.id, 'elsewhere=['+x.elsewhere.join(',')+']', JSON.stringify(x.m)));
// also 611
const r611 = data.filter(r => r.marker_text && r.encoded_ref && String(r.encoded_ref.section_id)==='611');
console.log('\nsection_id=611 rows:', r611.length, '(target per manifest:', (()=>{const m=JSON.parse(readFileSync('claude-generation-manifest.json','utf8'));return m.section_digests?.meta?.['611']?.target_file;})(), ')');
const noRef = data.filter(r=>r.marker_text && !r.encoded_ref);
console.log('rows with marker_text but NO encoded_ref:', noRef.length);
