import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.rpc('exec_sql', { sql: `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.venture_channel_publish_ledger'::regclass ORDER BY conname` });
console.log('constraints:', error ? 'ERR '+error.message : JSON.stringify(data));
const { error: e2 } = await sb.from('venture_channel_publish_ledger').select('execution_mode').limit(1);
console.log('execution_mode live probe:', e2 ? `${e2.code}: ${e2.message}` : 'COLUMN EXISTS');
