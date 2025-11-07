import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

const { data, error } = await client
  .from('leo_protocol_sections')
  .select('id, title, section_type, context_tier, target_file')
  .ilike('title', '%Child SD%');

if (error) {
  console.error('Error:', error);
} else {
  console.log('Child SD Pattern sections in database:');
  console.log(JSON.stringify(data, null, 2));
}
