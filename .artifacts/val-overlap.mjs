import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SELF = 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5';
const OPEN = ['draft', 'active', 'in_progress', 'pending_approval', 'ready', 'planning'];

const { data, error } = await s.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,description,created_at').in('status', OPEN);
if (error) { console.error(error.message); process.exit(1); }

const RX = /SECURITY DEFINER|ALTER DEFAULT PRIVILEGES|REVOKE\s+(?:ALL|EXECUTE)|EXECUTE\s+ON\s+FUNCTION|has_function_privilege|prosecdef|grant EXECUTE/i;
const hits = [];
for (const r of data) {
  if (r.id === SELF) continue;
  const txt = `${r.title || ''}\n${r.description || ''}`;
  const m = txt.match(RX);
  if (m) hits.push({ sd_key: r.sd_key, status: r.status, phase: r.current_phase, phrase: m[0], title: (r.title || '').slice(0, 95) });
}
console.log(`Open SDs scanned: ${data.length}. Grant/SECDEF-related matches (excluding self): ${hits.length}`);
for (const h of hits) console.log(`  [${h.status}/${h.phase}] ${h.sd_key}  <${h.phrase}>\n      ${h.title}`);

// Quick fixes
const { data: qf, error: qfErr } = await s.from('quick_fixes').select('qf_key,status,title,description').limit(2000);
if (qfErr) { console.log('quick_fixes:', qfErr.message.slice(0, 60)); }
else {
  const open = qf.filter(q => !['completed', 'cancelled', 'rejected', 'merged'].includes((q.status || '').toLowerCase()));
  const qh = open.filter(q => RX.test(`${q.title || ''}\n${q.description || ''}`));
  console.log(`\nOpen QFs scanned: ${open.length}. Matches: ${qh.length}`);
  for (const q of qh) console.log(`  [${q.status}] ${q.qf_key}: ${(q.title || '').slice(0, 95)}`);
}
