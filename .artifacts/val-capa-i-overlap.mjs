import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('strategic_directives_v2').select('sd_key,title,status,current_phase,progress,updated_at,metadata').or('sd_key.ilike.%LAUNCH-READINESS%,sd_key.ilike.%VENTURE-QUALITY-CAPA%');
for (const r of (data||[])) console.log(`${r.status.padEnd(10)} ${String(r.current_phase).padEnd(14)} ${String(r.progress).padStart(3)}%  ${r.sd_key}`);
