import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const sdIdentifier = process.argv[2];

if (!sdIdentifier) {
  console.error('Usage: node fetch-single-sd.js SD-IDENTIFIER');
  console.error('Example: node fetch-single-sd.js SD-BACKEND-003');
  process.exit(1);
}

const supabase = createSupabaseServiceClient();

// Try id column first (newer SDs like SD-BACKEND-003 use this)
let { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', sdIdentifier)
  .maybeSingle();

// If not found by id, try sd_key column (legacy SDs)
if (!data && !error) {
  const result = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdIdentifier)
    .maybeSingle();
  data = result.data;
  error = result.error;
}

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

if (!data) {
  console.error(`SD not found: ${sdIdentifier}`);
  console.error('Tried both id and sd_key columns');
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
