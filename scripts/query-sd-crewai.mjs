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

const { data: sd, error: sdError} = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-CREWAI-ARCHITECTURE-001')
  .maybeSingle();

console.log('=== SD RECORD ===');
if (sdError) {
  console.log('Error:', sdError.message);
} else if (!sd) {
  console.log('SD NOT FOUND');
} else {
  console.log('ID:', sd.id);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Current Phase:', sd.current_phase);
  console.log('Priority:', sd.priority);
  console.log('Category:', sd.category);
  console.log('Created:', sd.created_at);
  console.log('\n--- SCOPE ---');
  console.log(sd.scope.substring(0, 500) + '...');
  console.log('\n--- RATIONALE ---');
  console.log(sd.rationale.substring(0, 500) + '...');
}

const { data: prds, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status, progress')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001');

console.log('\n=== RELATED PRDS ===');
if (prdError) {
  console.log('PRD Error:', prdError.message);
} else if (prds.length === 0) {
  console.log('NO PRDS FOUND');
} else {
  prds.forEach(prd => {
    console.log(`- ${prd.id}: ${prd.title} [${prd.status}] ${prd.progress}%`);
  });
}
