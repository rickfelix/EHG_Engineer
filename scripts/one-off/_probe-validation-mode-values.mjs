import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get distinct existing validation_mode values
const { data } = await sb.from('sub_agent_execution_results')
  .select('validation_mode, source, verdict, sub_agent_code')
  .order('created_at', { ascending: false })
  .limit(50);
const modes = new Set();
const sources = new Set();
const verdicts = new Set();
for (const r of (data||[])) {
  if (r.validation_mode) modes.add(r.validation_mode);
  if (r.source) sources.add(r.source);
  if (r.verdict) verdicts.add(r.verdict);
}
console.log('validation_mode values:', [...modes]);
console.log('source values:', [...sources]);
console.log('verdict values:', [...verdicts]);
