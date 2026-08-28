import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('product_requirements_v2')
  .select('id, directive_id, functional_requirements, test_scenarios, risks')
  .eq('directive_id', 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001')
  .maybeSingle();
console.log(JSON.stringify({ id: data?.id, error: error?.message }, null, 2));
