require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  // Get high priority SDs
  const { data: highPrioritySDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, priority, status, sequence_rank, current_phase')
    .eq('priority', 'high')
    .order('sequence_rank', { ascending: true, nullsFirst: false })
    .limit(20);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('High Priority Strategic Directives:\n');
  console.log('Seq | SD Key | Status | Phase | Title');
  console.log('----+--------+--------+-------+------');

  highPrioritySDs.forEach(sd => {
    const seq = sd.sequence_rank || 'NULL';
    const key = sd.sd_key.padEnd(25);
    const status = (sd.status || 'none').padEnd(15);
    const phase = (sd.current_phase || 'none').padEnd(15);
    console.log(`${seq} | ${key} | ${status} | ${phase} | ${sd.title}`);
  });

  console.log('\n\nRecent/Draft Strategic Directives:\n');

  const { data: recentSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, priority, status, sequence_rank, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Seq | SD Key | Priority | Title');
  console.log('----+--------+----------+------');

  recentSDs.forEach(sd => {
    const seq = sd.sequence_rank || 'NULL';
    const key = sd.sd_key.padEnd(25);
    const priority = (sd.priority || 'none').padEnd(8);
    console.log(`${seq} | ${key} | ${priority} | ${sd.title}`);
  });

  process.exit(0);
})();
