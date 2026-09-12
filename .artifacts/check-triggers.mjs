import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.rpc('exec_sql', { sql: `select event_object_table, trigger_name, event_manipulation from information_schema.triggers where trigger_schema='public' and event_object_table in ('feedback','governance_audit_log') order by 1,2` });
console.log('ERR', error?.message);
console.log(JSON.stringify(data, null, 2));
