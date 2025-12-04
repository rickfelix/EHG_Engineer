import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('Fetching Strategic Directives...');

  // Query 1: Critical/High Priority SDs
  const { data: prioritySds, error: priorityError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .in('status', ['draft', 'active', 'in_progress', 'pending_approval'])
    .in('priority', ['critical', 'high']);

  if (priorityError) {
    console.error('Error fetching priority SDs:', priorityError);
    return;
  }

  // Query 2: Stage-related SDs (using client-side filtering for ILIKE if needed, or just fetch all and filter)
  // Supabase supports ilike
  const { data: stageSds, error: stageError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or('title.ilike.%stage%,title.ilike.%venture%workflow%');
    
  if (stageError) {
    console.error('Error fetching stage SDs:', stageError);
    return;
  }

  // Combine and deduplicate
  const allSdsMap = new Map();
  [...prioritySds, ...stageSds].forEach(sd => {
    allSdsMap.set(sd.id, sd);
  });

  const allSds = Array.from(allSdsMap.values());

  console.log(JSON.stringify(allSds, null, 2));
}

main();
