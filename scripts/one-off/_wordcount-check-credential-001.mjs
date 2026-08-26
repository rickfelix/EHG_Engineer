import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('strategic_directives_v2')
  .select('description')
  .eq('sd_key', 'SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001')
  .maybeSingle();
function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
console.log('exact wordCount():', wordCount(data.description));
console.log('length chars:', data.description.length);
