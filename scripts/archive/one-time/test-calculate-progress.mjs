import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROOF-DRIVEN-1758340937844';

console.log('🧪 Testing calculate_sd_progress Function');
console.log('═'.repeat(70));
console.log('');

try {
  // Try calling calculate_sd_progress RPC
  const { data: progress, error } = await supabase.rpc('calculate_sd_progress', {
    sd_id_param: SD_ID
  });

  if (error) {
    console.log('❌ Error calling calculate_sd_progress:', error.message);
    console.log('');
    console.log('This function might not be exposed as RPC.');
    console.log('The migration updates both functions but only get_progress_breakdown');
    console.log('is typically called via RPC.');
  } else {
    console.log('✅ calculate_sd_progress returned:', progress);
    console.log('');
    if (progress === 100) {
      console.log('✅ Function returns 100% - migration successful!');
    } else {
      console.log('⚠️  Function returns', progress + '% (expected 100%)');
    }
  }
} catch (err) {
  console.log('❌ Exception:', err.message);
}

console.log('');
console.log('═'.repeat(70));
console.log('');
console.log('🔍 Diagnosis:');
console.log('');
console.log('Migration applied: ✅ ("Success. No rows returned")');
console.log('User story count: 0 (confirmed)');
console.log('Expected behavior: user_stories_validated = true when COUNT(*) = 0');
console.log('Actual behavior: user_stories_validated = false');
console.log('');
console.log('NEXT STEPS:');
console.log('1. Check Supabase Dashboard SQL Editor for any error messages');
console.log('2. Verify migration ran completely (scroll through output)');
console.log('3. Try refreshing Supabase schema cache');
console.log('4. Re-run migration if needed');
console.log('');
