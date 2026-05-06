import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log('SUPABASE_URL host:', new URL(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).host);

// Probe candidate exec-sql RPCs
const candidates = ['exec_sql', 'pg_exec', 'execute_sql', 'admin_exec_sql', 'run_sql', 'sql'];
for (const fn of candidates) {
  const { data, error } = await supabase.rpc(fn, { sql: 'select 1 as ok' });
  console.log(`rpc ${fn}:`, error ? `ERR ${error.code} ${error.message?.slice(0,120)}` : `OK ${JSON.stringify(data)?.slice(0,200)}`);
}

// Direct table reads we know we'll need:
const probe = await supabase.from('ventures').select('id, name, workflow_status').limit(1);
console.log('ventures probe:', probe.error ? `ERR ${probe.error.message}` : `rows=${probe.data?.length}, sample=${JSON.stringify(probe.data?.[0])}`);
