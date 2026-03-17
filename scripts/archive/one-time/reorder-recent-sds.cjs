require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Priority weights for sorting (higher = more important)
const PRIORITY_WEIGHTS = {
  'critical': 4,
  'high': 3,
  'medium': 2,
  'low': 1
};

(async () => {
  console.log('🔍 Finding recent draft Strategic Directives...\n');

  // Get recent draft SDs
  const { data: recentSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, priority, status, sequence_rank, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('📋 Current Order (by creation date):\n');
  recentSDs.forEach((sd, index) => {
    console.log(`${index + 1}. [Seq: ${sd.sequence_rank}] ${sd.sd_key}`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   Title: ${sd.title}\n`);
  });

  // Sort by priority (critical > high > medium > low)
  const sortedSDs = [...recentSDs].sort((a, b) => {
    const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    // If same priority, sort by creation date (newer first)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  console.log('✨ Proposed New Order (by priority):\n');
  sortedSDs.forEach((sd, index) => {
    const newSeqRank = index + 1;
    const arrow = newSeqRank !== sd.sequence_rank ? '→ ' + newSeqRank : '(unchanged)';
    console.log(`${newSeqRank}. [Seq: ${sd.sequence_rank} ${arrow}] ${sd.sd_key}`);
    console.log(`   Priority: ${sd.priority.toUpperCase()}`);
    console.log(`   Title: ${sd.title}\n`);
  });

  console.log('\n📊 Summary of Changes:');
  console.log('---------------------------------------------------');
  sortedSDs.forEach((sd, index) => {
    const newSeqRank = index + 1;
    if (newSeqRank !== sd.sequence_rank) {
      console.log(`${sd.sd_key}: ${sd.sequence_rank} → ${newSeqRank}`);
    }
  });

  console.log('\n💡 Action: Updating sequence ranks...\n');

  // Update sequence ranks
  for (let i = 0; i < sortedSDs.length; i++) {
    const sd = sortedSDs[i];
    const newSeqRank = i + 1;

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ sequence_rank: newSeqRank })
      .eq('id', sd.id);

    if (updateError) {
      console.error(`❌ Error updating ${sd.sd_key}:`, updateError);
    } else {
      console.log(`✅ Updated ${sd.sd_key}: sequence_rank = ${newSeqRank}`);
    }
  }

  console.log('\n🎉 Reordering complete! Lowest number = Do first\n');

  process.exit(0);
})();
