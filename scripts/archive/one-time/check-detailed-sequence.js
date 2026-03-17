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
    .select('id, title, sequence_rank, priority, status')
    .eq('priority', 'high')
    .eq('status', 'active')
    .order('sequence_rank', { ascending: true, nullsLast: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('High-priority Active SDs by sequence_rank (ascending):');
  console.log('=======================================================');
  data.forEach((sd, index) => {
    const rank = sd.sequence_rank !== null ? sd.sequence_rank : 'NULL';
    const title = sd.title.length > 45 ? sd.title.substring(0, 45) + '...' : sd.title;
    console.log(`${index + 1}. ${sd.id.padEnd(10)} rank: ${String(rank).padEnd(4)} ${title}`);
  });

  console.log('\n📍 What you should see in the UI (with ascending sort):');
  console.log('1st: SD-1B (rank 1)');
  console.log('2nd: SD-003A (rank 2)');
  console.log('3rd: SD-028 (rank 3)');
  console.log('...');
  console.log('Last: SD-027 (rank 9)');

  console.log('\n⚠️  If SD-003 is appearing last, check its rank:');
  const sd003 = data.find(sd => sd.id === 'SD-003');
  if (sd003) {
    console.log(`SD-003 has rank: ${sd003.sequence_rank} - "${sd003.title}"`);
  }
}

check();