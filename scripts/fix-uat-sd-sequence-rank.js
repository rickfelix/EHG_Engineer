import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fixSequenceRank() {
  console.log('🔧 Fixing sequence_rank for SD-UAT-001...\n');

  // Get the highest sequence_rank
  const { data: maxRankData, error: maxError } = await supabase
    .from('strategic_directives_v2')
    .select('sequence_rank')
    .not('sequence_rank', 'is', null)
    .order('sequence_rank', { ascending: false })
    .limit(1)
    .single();

  if (maxError && maxError.code !== 'PGRST116') {
    console.error('❌ Error fetching max sequence_rank:', maxError);
    return;
  }

  const nextSequenceRank = (maxRankData?.sequence_rank || 0) + 1;

  console.log('📊 Current highest sequence_rank:', maxRankData?.sequence_rank);
  console.log('📊 Assigning sequence_rank:', nextSequenceRank);
  console.log('');

  // Update SD-UAT-001 with proper sequence_rank
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ sequence_rank: nextSequenceRank })
    .eq('sd_key', 'SD-UAT-001')
    .select('sd_key, title, sequence_rank, status, priority');

  if (error) {
    console.error('❌ Error updating:', error);
  } else {
    console.log('✅ Successfully updated SD-UAT-001:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n🎉 SD-UAT-001 should now be visible in the Strategic Directives list!');
  }
}

fixSequenceRank();