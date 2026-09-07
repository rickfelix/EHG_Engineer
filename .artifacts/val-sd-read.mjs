import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('strategic_directives_v2').select('*').eq('sd_key','SD-LEO-INFRA-FIXTURE-VENTURES-IDENTIFIED-001');
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
if (!data || data.length === 0) { console.log('NO ROWS'); process.exit(0); }
const r = data[0];
console.log('id:', r.id);
console.log('status:', r.status, '| phase:', r.current_phase, '| priority:', r.priority);
console.log('title:', r.title);
console.log('=== DESCRIPTION ===\n' + (r.description||''));
console.log('=== SCOPE ===\n' + (r.scope||''));
console.log('=== RATIONALE ===\n' + (r.rationale||''));
console.log('=== STRATEGIC_INTENT ===\n' + (r.strategic_intent||''));
console.log('=== SUCCESS_CRITERIA ===\n' + JSON.stringify(r.success_criteria, null, 2));
console.log('=== METADATA ===\n' + JSON.stringify(r.metadata, null, 2).slice(0,8000));
