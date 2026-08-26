import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.rpc('exec_sql', { sql: `select column_name, is_nullable, column_default, data_type from information_schema.columns where table_name='chairman_decisions' and column_name in ('attempt_number','status','override_key','consumed_at','lifecycle_stage') order by column_name;` });
if (error) { console.log('rpc exec_sql unavailable:', error.message); }
else console.log(JSON.stringify(data, null, 1));
