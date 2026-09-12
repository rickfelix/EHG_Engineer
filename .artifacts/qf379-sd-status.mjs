import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: qf } = await sb.from('quick_fixes').select('id,status,escalated_to_sd_id,resolution_sd_id').eq('id','QF-20260903-239').maybeSingle();
console.log('QF-20260903-239', JSON.stringify(qf));
const { data: sd } = await sb.from('strategic_directives_v2').select('status,current_phase,sd_key,created_at,completion_date').eq('sd_key','SD-LEO-FIX-GATE-PLAN-EXEC-001').maybeSingle();
console.log('SD-LEO-FIX-GATE-PLAN-EXEC-001', JSON.stringify(sd));
