import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('strategic_directives_v2')
  .select('id, description, smoke_test_steps')
  .eq('sd_key', 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001')
  .maybeSingle();
console.log('DESCRIPTION (' + data.description.split(/\s+/).length + ' words):');
console.log(data.description);
console.log('SMOKE TEST STEPS:');
console.log(JSON.stringify(data.smoke_test_steps, null, 2));
