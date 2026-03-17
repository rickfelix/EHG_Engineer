import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Check if the function exists
const { data: functions, error: funcError } = await supabase
  .from('pg_proc')
  .select('proname')
  .like('proname', '%match_sub_agents%');

if (funcError) {
  console.log('Could not query functions (expected with Supabase client)');
}

// Try calling with minimal parameters
console.log('Testing hybrid function with minimal parameters...\n');
const testEmbedding = Array(1536).fill(0.01);
const { data, error } = await supabase.rpc('match_sub_agents_hybrid', {
  query_embedding: testEmbedding,
  keyword_matches: { "API": 3, "DATABASE": 2 }
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Success! Got', data?.length || 0, 'results');
  if (data && data.length > 0) {
    console.log('Sample result:', JSON.stringify(data[0], null, 2));
  }
}
