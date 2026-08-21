import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const KEY = 'SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';
let { data, error } = await s.from('strategic_directives_v2').select('*').eq('sd_key', KEY).maybeSingle();
if (!data) {
  const r = await s.from('strategic_directives_v2').select('*').eq('id', KEY).maybeSingle();
  data = r.data; error = r.error;
}
if (error) console.error('ERR', error);
if (!data) { console.log('STILL NOT FOUND'); process.exit(0); }
console.log(JSON.stringify({
  id: data.id, sd_key: data.sd_key, uuid_id: data.uuid_id, title: data.title,
  status: data.status, current_phase: data.current_phase, sd_type: data.sd_type,
  priority: data.priority, category: data.category, target_application: data.target_application,
  parent_sd_id: data.parent_sd_id, is_orchestrator: data.is_orchestrator,
  created_at: data.created_at
}, null, 2));
console.log('=== SCOPE ==='); console.log(data.scope);
console.log('=== DESCRIPTION ==='); console.log(data.description);
console.log('=== METADATA KEYS ==='); console.log(JSON.stringify(Object.keys(data.metadata||{})));
