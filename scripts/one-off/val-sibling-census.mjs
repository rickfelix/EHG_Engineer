import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Broader census: which tables even HAVE a source_metadata (or credential-ish jsonb) column?
const { data, error } = await s.rpc('exec_sql', { query: `
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public'
    AND (column_name ILIKE '%metadata%' OR column_name ILIKE '%token%' OR column_name ILIKE '%credential%' OR column_name ILIKE '%secret%')
  ORDER BY table_name, column_name` });
if (error) { console.log('exec_sql rpc unavailable:', error.message); }
else { console.log('COLUMNS OF INTEREST (public schema):'); console.table ? console.log(JSON.stringify(data,null,1).slice(0,4000)) : console.log(data); }
