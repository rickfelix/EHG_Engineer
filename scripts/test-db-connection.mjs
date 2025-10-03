import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load only the main .env file, skip .env.uat
dotenv.config({ path: '.env' });

console.log('Testing Supabase Connection...\n');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
console.log('Key (first 50 chars):', supabaseKey?.substring(0, 50) + '...');
console.log('');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test 1: Simple query
console.log('Test 1: Querying strategic_directives_v2...');
const { data: sds, error: sdsError } = await supabase
  .from('strategic_directives_v2')
  .select('id, title')
  .limit(3);

if (sdsError) {
  console.error('❌ Error:', sdsError.message);
} else {
  console.log('✅ Success! Found', sds.length, 'records');
  sds.forEach(sd => console.log('  -', sd.id, ':', sd.title));
}

// Test 2: Query specific SD
console.log('\nTest 2: Querying SD-RECONNECT-004...');
const { data: sd004, error: sd004Error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase')
  .eq('id', 'SD-RECONNECT-004')
  .single();

if (sd004Error) {
  console.error('❌ Error:', sd004Error.message);
} else {
  console.log('✅ Found SD-RECONNECT-004:');
  console.log('   Title:', sd004.title);
  console.log('   Status:', sd004.status);
  console.log('   Phase:', sd004.current_phase);
}

// Test 3: Check handoff_tracking table
console.log('\nTest 3: Checking handoff_tracking table...');
const { data: handoffs, error: handoffError } = await supabase
  .from('handoff_tracking')
  .select('count')
  .limit(1);

if (handoffError) {
  console.error('❌ Error:', handoffError.message);
  if (handoffError.code === '42P01') {
    console.log('   Table does not exist. This is expected if not created yet.');
  }
} else {
  console.log('✅ handoff_tracking table exists');
}

console.log('\n=== Connection Test Complete ===');
