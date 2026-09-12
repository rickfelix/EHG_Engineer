import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TERMINAL_QF = new Set(['completed', 'cancelled']);
const TERMINAL_SD = new Set(['completed', 'cancelled']);
const { data: open } = await s.from('adam_task_ledger').select('id,source_kind,source_ref,title,status,parent_id').eq('status', 'open').eq('source_kind', 'sourced_sd');
let closed = 0, kept = 0, unknown = 0;
for (const r of open || []) {
  const ref = String(r.source_ref || '').trim();
  let terminal = null;
  if (/^QF-/.test(ref)) { const { data: q } = await s.from('quick_fixes').select('status').eq('id', ref).maybeSingle(); terminal = q ? (TERMINAL_QF.has(q.status) ? q.status : null) : 'missing'; }
  else if (/^SD-/.test(ref)) { const { data: d } = await s.from('strategic_directives_v2').select('status').eq('sd_key', ref).maybeSingle(); terminal = d ? (TERMINAL_SD.has(d.status) ? d.status : null) : 'missing'; }
  else { unknown++; continue; }
  if (terminal && terminal !== 'missing') {
    const { error } = await s.from('adam_task_ledger').update({ status: 'done', blocker: `CLOSED AT SOURCE 2026-09-12 02:5xZ (Adam 49eabb23, Solomon board check #58): ${ref} is ${terminal}; no close-at-source writer exists yet (ticketed).` }).eq('id', r.id);
    console.log(error ? ('ERR ' + r.id.slice(0, 8) + ' ' + error.message.slice(0, 60)) : ('CLOSED ' + r.id.slice(0, 8) + ' ' + ref + ' (' + terminal + ')'));
    if (!error) closed++;
  } else kept++;
}
console.log(`summary: open sourced children scanned=${(open || []).length} closed=${closed} kept=${kept} non-key refs=${unknown}`);
