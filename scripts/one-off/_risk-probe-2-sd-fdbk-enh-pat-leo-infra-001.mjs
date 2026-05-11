import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// SD lookup via UUID
console.log('--- A. SD record via UUID ---');
const { data: sd, error: eA } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,sd_type,priority,key_changes,risks,implementation_guidelines,dependencies,metadata,smoke_test_steps')
  .eq('id', '670b1f01-95c2-4695-b7a9-979f9db2c598')
  .maybeSingle();
console.log('Error:', eA?.message);
console.log(JSON.stringify(sd, null, 2));

// Also try sd_key with different casing/variant
console.log('\n--- B. Probe for any SD with PAT-LEO in key ---');
const { data: matchSds } = await supabase
  .from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase')
  .ilike('sd_key', '%PAT-LEO-INFRA%')
  .order('created_at', { ascending: false })
  .limit(10);
console.log(JSON.stringify(matchSds, null, 2));

// Status distribution across SDs
console.log('\n--- C. SD status distribution ---');
const statuses = ['draft', 'active', 'in_progress', 'completed', 'archived', 'cancelled', 'paused', 'blocked', 'pending'];
for (const s of statuses) {
  const { count } = await supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true })
    .eq('status', s);
  console.log(`  status=${s}: ${count}`);
}

// Check quick_fixes status distribution too (function may also fire on QFs)
console.log('\n--- D. Recent sub_agent_execution_results for this SD ---');
const { data: subAgs } = await supabase
  .from('sub_agent_execution_results')
  .select('id,sub_agent_code,phase,status,confidence,verdict,created_at,sd_id')
  .eq('sd_id', '670b1f01-95c2-4695-b7a9-979f9db2c598')
  .order('created_at', { ascending: false })
  .limit(10);
console.log(JSON.stringify(subAgs, null, 2));
