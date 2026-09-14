import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('strategic_directives_v2')
  .select('description,scope,metadata').eq('sd_key','SD-LEARN-FIX-ADDRESS-PAT-LES-010').maybeSingle();
console.log('DESC:\n', String(data?.description||'(empty)').slice(0,900));
console.log('\nSCOPE:\n', String(data?.scope||'(empty)').slice(0,600));
const m = data?.metadata||{};
console.log('\nMETA keys:', Object.keys(m).join(', '));
console.log('key_changes:', JSON.stringify(m.key_changes||null).slice(0,400));
