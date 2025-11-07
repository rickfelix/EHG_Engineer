import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

const { data, error } = await client
  .from('retrospectives')
  .select('*')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .single();

if (data) {
  console.log('Existing retrospective columns:');
  console.log(JSON.stringify(Object.keys(data), null, 2));
}
