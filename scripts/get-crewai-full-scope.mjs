import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('scope, success_criteria')
  .eq('id', 'SD-CREWAI-ARCHITECTURE-001')
  .maybeSingle();

if (error || !sd) {
  console.log('Error:', error?.message || 'SD not found');
} else {
  console.log('=== FULL SCOPE ===\n');
  console.log(sd.scope);
  console.log('\n=== SUCCESS CRITERIA ===\n');
  console.log(sd.success_criteria);
}
