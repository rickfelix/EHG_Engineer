import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// FR-1: flag row
const { data: flag, error: fe } = await sb.from('leo_feature_flags').select('flag_key,is_enabled,description').ilike('flag_key','%STAGE_GATE%');
console.log('FR-1 STAGE_GATE flags:', JSON.stringify(flag), fe?.message||'');

// FR-7: Part B follow-on SD
const { data: partb } = await sb.from('strategic_directives_v2').select('sd_key,title,status').or('sd_key.ilike.%FIRST-STRANGER%,sd_key.ilike.%MOCK-RUN%,title.ilike.%first-stranger%,title.ilike.%first stranger%');
console.log('FR-7 Part B candidate SDs:', JSON.stringify(partb));

// FR-7: the two atomic-obligation flags
const { data: hc } = await sb.from('leo_feature_flags').select('flag_key,is_enabled').in('flag_key',['HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED','LEO_HIGH_CONSEQUENCE_GATES_ENABLED']);
console.log('FR-7 atomic-obligation flags:', JSON.stringify(hc));

// FR-4/FR-5: are the migrations applied? probe the columns
const { data: led, error: le } = await sb.from('venture_channel_publish_ledger').select('execution_mode,mock_run_id').limit(1);
console.log('FR-4 execution_mode column applied?', le ? 'NO -> '+le.message.slice(0,110) : 'YES (columns readable)');

// existing ledger rows / outcomes
const { data: rows } = await sb.from('venture_channel_publish_ledger').select('id,decision,outcome').limit(20);
console.log('ledger rows:', rows?.length, JSON.stringify((rows||[]).map(r=>({d:r.decision,o:r.outcome}))));

// live below-go-live ventures named in FR-6
const { data: v } = await sb.from('ventures').select('name,is_demo,status,current_lifecycle_stage,launch_mode').or('name.ilike.%AltifyAI%,name.ilike.%ApexNiche%');
console.log('FR-6 matrix ventures (live shapes):', JSON.stringify(v));
