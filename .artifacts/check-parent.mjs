import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd } = await supabase.from('strategic_directives_v2').select('id, sd_key, status, current_phase, updated_at').eq('sd_key', 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001').maybeSingle();
console.log('Parent:', JSON.stringify(sd, null, 2));
const { data: handoffs } = await supabase.from('sd_phase_handoffs').select('id, handoff_type, status, metadata, created_at').eq('sd_id', sd.id).order('created_at', { ascending: false }).limit(8);
console.log('Handoffs:', JSON.stringify(handoffs, null, 2));
