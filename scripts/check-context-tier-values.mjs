import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

const { data } = await client
  .from('leo_protocol_sections')
  .select('context_tier')
  .limit(10);

if (data) {
  const tiers = [...new Set(data.map(d => d.context_tier))];
  console.log('Valid context_tier values:', tiers.join(', '));
}
