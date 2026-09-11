import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, created_at, sd_id')
  .eq('sd_id', '8038cf96-36e5-4917-97ad-491d4ff51bae')
  .order('created_at', { ascending: false });
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
