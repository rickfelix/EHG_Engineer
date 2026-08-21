import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2')
  .select('*')
  .eq('id','SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001')
  .maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.log('NOT FOUND by id'); process.exit(0); }
console.log(JSON.stringify({
  id: data.id, sd_key: data.sd_key, uuid_id: data.uuid_id, title: data.title,
  status: data.status, current_phase: data.current_phase, sd_type: data.sd_type,
  priority: data.priority, category: data.category, target_application: data.target_application,
  parent_sd_id: data.parent_sd_id, is_orchestrator: data.is_orchestrator,
  scope: data.scope, description: data.description,
  strategic_objectives: data.strategic_objectives,
  success_criteria: data.success_criteria,
  created_at: data.created_at
}, null, 2));
console.log('--- METADATA KEYS ---');
console.log(JSON.stringify(Object.keys(data.metadata || {})));
