import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!anonKey) {
  console.error('SUPABASE_ANON_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

(async () => {
  console.log('=== Testing Chairman (ANON) Access ===\n');

  // Test 1: strategic_directives_v2
  console.log('Test 1: strategic_directives_v2');
  const { data: sd_data, error: sd_error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title')
    .limit(1);

  console.log(sd_error ? `❌ Error: ${sd_error.message}` : `✅ Success: ${sd_data?.length || 0} rows`);

  // Test 2: leo_protocol_sections (use correct column names)
  console.log('\nTest 2: leo_protocol_sections');
  const { data: lps_data, error: lps_error } = await supabase
    .from('leo_protocol_sections')
    .select('id, title')
    .limit(1);

  console.log(lps_error ? `❌ Error: ${lps_error.message}` : `✅ Success: ${lps_data?.length || 0} rows`);

  // Test 3: board_members (use correct column names)
  console.log('\nTest 3: board_members');
  const { data: bm_data, error: bm_error } = await supabase
    .from('board_members')
    .select('id, board_role')
    .limit(1);

  console.log(bm_error ? `❌ Error: ${bm_error.message}` : `✅ Success: ${bm_data?.length || 0} rows`);
  if (bm_error) {
    console.log('⚠️  VIOLATION: board_members blocks Chairman SELECT access');
  }

  console.log('\n=== Summary ===');
  console.log('strategic_directives_v2:', sd_error ? '❌ BLOCKED' : '✅ ALLOWED');
  console.log('leo_protocol_sections:', lps_error ? '❌ BLOCKED' : '✅ ALLOWED');
  console.log('board_members:', bm_error ? '❌ BLOCKED (NEEDS FIX)' : '✅ ALLOWED');

  if (bm_error) {
    console.log('\n⚠️  SUCCESS CRITERION 1 FAILED: Chairman cannot SELECT from board_members');
    console.log('   Current policy: board_members_service_role_access (fn_is_service_role())');
    console.log('   Required: Add authenticated SELECT policy or modify ALL policy qual');
  }
})();
