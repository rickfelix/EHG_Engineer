import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

console.log('\n🔄 Updating all SD-CREWAI-ARCHITECTURE-001 user stories to completed...\n');

const { data, error } = await client
  .from('user_stories')
  .update({ status: 'completed' })
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .eq('status', 'ready')
  .select('story_key, title');

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log(`✅ Updated ${data.length} user stories to completed:\n`);
data.forEach(s => console.log(`   ${s.story_key}: ${s.title}`));
