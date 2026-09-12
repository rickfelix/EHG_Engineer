import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001').maybeSingle();
const { data } = await supabase.from('sd_scope_deliverables').select('deliverable_name, metadata').eq('sd_id', sd.id);
console.log(JSON.stringify(data, null, 2));
