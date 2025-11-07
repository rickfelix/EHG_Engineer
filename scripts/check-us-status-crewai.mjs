import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const client = await createSupabaseServiceClient('engineer', { verbose: false });

const { data: stories, error } = await client
  .from('user_stories')
  .select('story_key, title, status, story_points')
  .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
  .order('story_key');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('\n=== User Stories for SD-CREWAI-ARCHITECTURE-001 ===\n');

const byStatus = {
  completed: [],
  in_progress: [],
  pending: [],
  other: []
};

stories.forEach(s => {
  if (s.status === 'completed') byStatus.completed.push(s);
  else if (s.status === 'in_progress') byStatus.in_progress.push(s);
  else if (s.status === 'pending') byStatus.pending.push(s);
  else byStatus.other.push(s);
});

const sumPoints = (list) => list.reduce((sum, s) => sum + (s.story_points || 0), 0);

console.log(`✅ Completed: ${byStatus.completed.length} (${sumPoints(byStatus.completed)} points)`);
byStatus.completed.forEach(s => console.log(`   ${s.story_key}: ${s.title} (${s.story_points} pts)`));

console.log(`\n⏳ In Progress: ${byStatus.in_progress.length} (${sumPoints(byStatus.in_progress)} points)`);
byStatus.in_progress.forEach(s => console.log(`   ${s.story_key}: ${s.title} (${s.story_points} pts)`));

console.log(`\n🔴 Pending: ${byStatus.pending.length} (${sumPoints(byStatus.pending)} points)`);
byStatus.pending.forEach(s => console.log(`   ${s.story_key}: ${s.title} (${s.story_points} pts)`));

if (byStatus.other.length > 0) {
  console.log(`\n⚠️  Other: ${byStatus.other.length}`);
  byStatus.other.forEach(s => console.log(`   ${s.story_key}: ${s.status}`));
}

console.log(`\n📊 Total: ${stories.length} stories, ${sumPoints(stories)} points`);
