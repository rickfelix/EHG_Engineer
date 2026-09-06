import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd } = await supabase.from('strategic_directives_v2').select('id,sd_key').eq('sd_key', 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003').maybeSingle();
const { data: prd, error } = await supabase.from('product_requirements_v2').select('id,directive_id,title,status').or(`directive_id.eq.${sd.id},directive_id.eq.${sd.sd_key}`);
console.log('PRDs:', JSON.stringify(prd, null, 2), error);
