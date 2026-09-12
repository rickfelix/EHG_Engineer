import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const id of ['QF-20260903-722','QF-20260903-020','QF-20260903-822']) {
  const { data } = await sb.from('quick_fixes').select('id,status,escalated_to_sd_id,resolution_sd_id,pr_url').eq('id', id).maybeSingle();
  console.log(id, JSON.stringify(data));
}
