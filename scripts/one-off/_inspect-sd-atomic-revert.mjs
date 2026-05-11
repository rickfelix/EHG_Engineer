import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, title, sd_type, priority, status, current_phase, progress, description, scope, key_changes, success_criteria, metadata, governance_metadata, dependencies, target_application, smoke_test_steps')
  .eq('sd_key', 'SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001')
  .single();
if (error) { console.error('ERROR:', error.message); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
