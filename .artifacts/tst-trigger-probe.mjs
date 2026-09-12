import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Try RPC exec_sql variants
const q = `
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
WHERE t.tgrelid = 'public.feedback'::regclass AND NOT t.tgisinternal;
`;
for (const fn of ['exec_sql','execute_sql','sql','run_sql']) {
  const { data, error } = await sb.rpc(fn, { query: q }).catch(e=>({error:e}));
  if (!error) { console.log('RPC', fn, 'OK'); console.log(JSON.stringify(data,null,2)); process.exit(0); }
  console.log('rpc', fn, 'err:', error.message?.slice(0,120));
}
