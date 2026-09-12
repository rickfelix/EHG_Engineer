import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('chairman_ratifications')
  .select('id, marker_text, encoded_at, encoded_ref, target_contracts').limit(1000);
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('total ratification rows:', data.length);
const TARGETS = ['CLAUDE_ADAM.md','CLAUDE_EXEC.md','CLAUDE_CORE.md','CLAUDE_LEAD.md'];
const cache = {};
const read = f => (cache[f] ??= existsSync(f) ? readFileSync(f,'utf8') : null);
// also read companions so we can see if a marker moved
const ALL = [...TARGETS,'CLAUDE_ADAM_PROVENANCE.md','CLAUDE_ADAM_MANUAL.md','CLAUDE_LEAD_MANUAL.md','CLAUDE_CORE_MANUAL.md','CLAUDE.md'];
let scoped=0, present=0, drift=[];
for (const r of data) {
  const tc = Array.isArray(r.target_contracts) ? r.target_contracts : [];
  const hit = TARGETS.filter(t => tc.some(x => String(x).includes(t)));
  if (!hit.length || !r.marker_text) continue;
  scoped++;
  for (const f of hit) {
    const c = read(f);
    if (c && c.includes(r.marker_text)) { present++; }
    else {
      const found = ALL.filter(o => { const cc=read(o); return cc && cc.includes(r.marker_text); });
      drift.push({ id: String(r.id).slice(0,8), expected: f, found_in: found, encoded: !!r.encoded_at, marker: (r.marker_text||'').slice(0,60) });
    }
  }
}
console.log('rows scoped to the 4 target contracts:', scoped);
console.log('marker present in expected file:', present);
console.log('DRIFTED (marker not in its named target contract):', drift.length);
for (const d of drift) console.log(' -', d.id, 'expected='+d.expected, 'found_in=['+d.found_in.join(',')+']', 'encoded='+d.encoded, '|', JSON.stringify(d.marker));
