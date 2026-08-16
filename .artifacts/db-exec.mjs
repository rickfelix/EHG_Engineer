import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
export const sb = createClient(url, key);
export async function q(sql) {
  const { data, error } = await sb.rpc("exec_sql", { sql_text: String(sql).trim() });
  if (error) throw new Error(`exec_sql failed: ${error.message} :: ${JSON.stringify(error)}`);
  return data;
}
