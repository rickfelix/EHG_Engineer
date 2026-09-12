import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: fixSd } = await supabase.from('strategic_directives_v2').select('status, current_phase').eq('sd_key', 'SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001').maybeSingle();
console.log('FixSD:', JSON.stringify(fixSd));
const { data: parent } = await supabase.from('strategic_directives_v2').select('status, current_phase').eq('sd_key', 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001').maybeSingle();
console.log('Parent:', JSON.stringify(parent));
