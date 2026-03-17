import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, sequence_rank')
    .in('status', ['active', 'draft'])
    .in('priority', ['critical', 'high'])
    .order('sequence_rank', { ascending: true, nullsLast: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const withRank = data.filter(sd => sd.sequence_rank !== null);
  const withoutRank = data.filter(sd => sd.sequence_rank === null);

  console.log('Critical/High Priority Active/Draft SDs:');
  console.log('=========================================');
  console.log('\nSDs WITH sequence_rank:', withRank.length);
  withRank.forEach(sd => {
    console.log(`  ${sd.id} (rank: ${sd.sequence_rank}, ${sd.priority}, ${sd.status})`);
  });

  if (withoutRank.length > 0) {
    console.log('\nSDs WITHOUT sequence_rank:', withoutRank.length);
    withoutRank.forEach(sd => {
      console.log(`  ${sd.id} (${sd.priority}, ${sd.status})`);
    });
  }

  console.log('\n📍 Total SDs that will display:', data.length);
  console.log('📍 Expected order: SDs with sequence_rank (1-9) first, then any without rank');
}

check();