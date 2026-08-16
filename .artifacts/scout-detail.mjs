import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const KEYS = [
  'SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001',
  'SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001',
  'SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001',
];

for (const k of KEYS) {
  const { data } = await s.from('strategic_directives_v2')
    .select('sd_key,title,status,current_phase,created_at,completion_date,description,scope')
    .eq('sd_key', k).maybeSingle();
  if (!data) { console.log(`\n### ${k} :: NOT FOUND`); continue; }
  console.log(`\n### ${data.sd_key} [${data.status}/${data.current_phase}] created=${(data.created_at||'').slice(0,10)} done=${(data.completion_date||'').slice(0,10)}`);
  const d = (data.description || '').replace(/\s+/g, ' ');
  console.log('DESC:', d.slice(0, 1500));
  const adp = /ALTER DEFAULT PRIVILEGES/i.test(data.description + ' ' + (data.scope||''));
  const fn = /ON FUNCTIONS|EXECUTE|SECURITY DEFINER/i.test(data.description + ' ' + (data.scope||''));
  console.log(`FLAGS: mentions_ALTER_DEFAULT_PRIVILEGES=${adp} mentions_EXECUTE/SECDEF=${fn}`);
}
