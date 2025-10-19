import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking Function Definition');
console.log('═'.repeat(70));
console.log('');

// Query the function source code from pg_proc
const { data, error } = await supabase.rpc('exec_sql', {
  query: `
    SELECT
      p.proname as function_name,
      pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'get_progress_breakdown'
      AND n.nspname = 'public'
  `
});

if (error) {
  console.log('Cannot query function definition (expected - no exec_sql RPC)');
  console.log('');
  console.log('Alternative: Check if COUNT(*) = 0 logic is working...');
  console.log('');

  // Test with a direct query
  const { data: userStoryCount } = await supabase
    .from('user_stories')
    .select('*', { count: 'exact', head: true })
    .eq('sd_id', 'SD-PROOF-DRIVEN-1758340937844');

  console.log('User Stories for SD-PROOF-DRIVEN-1758340937844:');
  console.log('Count:', userStoryCount || 0);
  console.log('');

  if (userStoryCount === 0) {
    console.log('✅ No user stories (COUNT(*) = 0)');
    console.log('');
    console.log('Migration should return user_stories_validated: true');
    console.log('But we got: false');
    console.log('');
    console.log('Possible causes:');
    console.log('1. Function not actually replaced (Supabase caching?)');
    console.log('2. Query using wrong schema/database');
    console.log('3. Migration syntax error (silent fail?)');
    console.log('');
    console.log('RECOMMENDATION:');
    console.log('Re-run migration in Supabase Dashboard and check for errors');
  }

  process.exit(0);
}

console.log('Function Definition:');
console.log(data);
