import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

const { data } = await client
  .from('leo_protocol_sections')
  .select('*')
  .limit(1);

if (data && data.length > 0) {
  console.log('leo_protocol_sections columns:');
  console.log(Object.keys(data[0]).join(', '));
}
