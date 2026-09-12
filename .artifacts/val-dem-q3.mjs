import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ids = {
  'CANDIDATE_SELF (draft, Demand engine fail-closed GO-LIVE gate)': '4520716b-0603-46b5-bf7e-19fe4271fe3b',
  'PARENT? (Venture Demand/Distribution Engine — design)': 'c6c645c6-2f94-41b6-8e80-2642d7fcdc23',
  'CHILD E? (Demand engine Child E first-stranger)': '2aae4258-c657-470d-bb68-4efc0585a692',
  'STAGE-GATE-PREDICATE-001 (completed, built the predicate)': 'a9f80ce6-bb5f-42cc-8ed8-6dbe80d71984',
  'AltifyAI first customer acq (active EXEC, mentions ledger)': 'fea509b8-643e-4363-b415-baffb0c2df95',
};
for (const [label, id] of Object.entries(ids)) {
  const { data: r, error } = await sb.from('strategic_directives_v2').select('*').eq('id', id).maybeSingle();
  console.log(`\n########## ${label}`);
  if (error || !r) { console.log('ERR/absent', error?.message); continue; }
  console.log(JSON.stringify({id:r.id, sd_key:r.sd_key, title:r.title, status:r.status, current_phase:r.current_phase, priority:r.priority, parent_sd_id:r.parent_sd_id, created_at:r.created_at, updated_at:r.updated_at}, null, 2));
  console.log('--- DESCRIPTION ---'); console.log((r.description||'(empty)').slice(0,3500));
  console.log('--- SCOPE ---'); console.log((r.scope||'(empty)').slice(0,2500));
  console.log('--- METADATA ---'); console.log(JSON.stringify(r.metadata||{}, null, 1).slice(0,5000));
}
