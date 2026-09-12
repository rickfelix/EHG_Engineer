import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('strategic_directives_v2').select('success_metrics').eq('id','00b9c8b0-ab15-4a95-8baf-59b5120095aa').maybeSingle();
console.log(JSON.stringify(data?.success_metrics, null, 1));
