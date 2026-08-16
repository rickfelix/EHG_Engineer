import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,description,scope,created_at').eq('id','ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5').single();
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('SD_KEY:', data.sd_key);
console.log('TITLE:', data.title);
console.log('STATUS:', data.status, '| PHASE:', data.current_phase, '| CREATED:', data.created_at);
console.log('=== DESCRIPTION ===');
console.log(data.description);
console.log('=== SCOPE ===');
console.log(typeof data.scope === 'string' ? data.scope : JSON.stringify(data.scope, null, 2));
