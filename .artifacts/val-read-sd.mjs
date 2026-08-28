import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('strategic_directives_v2')
  .select('id,sd_key,title,status,scope,target_application,metadata,description')
  .eq('sd_key','SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001').maybeSingle();
if (error) console.error(error);
console.log(JSON.stringify(data, null, 2));
