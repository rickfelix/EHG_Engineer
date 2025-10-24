import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('URL:', supabaseUrl ? 'Found' : 'Missing');
  console.error('Key:', supabaseKey ? 'Found' : 'Missing');
  process.exit(1);
}

async function updateRemainingStories() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Update remaining implemented stories to completed
  const storiesToComplete = [
    { pattern: 'Extract LLM cost/token data', reason: 'US-006: LLMUsageMetrics added to intelligenceAgents.ts' },
    { pattern: 'Wrap UI text in t()', reason: 'US-008: i18n config + translations implemented' },
    { pattern: 'Display cache age', reason: 'US-004: Already implemented in ExecuteAnalysisTab.tsx' }
  ];

  console.log('Updating remaining user stories to completed status...\n');

  for (const story of storiesToComplete) {
    const { data: matchingStories, error: searchError } = await supabase
      .from('user_stories')
      .select('id, story_id, title, status')
      .eq('sd_id', 'SD-VWC-PHASE1-001')
      .ilike('title', `%${story.pattern}%`);

    if (searchError) {
      console.error(`Error searching for story '${story.pattern}':`, searchError.message);
      continue;
    }

    if (!matchingStories || matchingStories.length === 0) {
      console.log(`⚠️  No story found matching: ${story.pattern}`);
      continue;
    }

    const storyToUpdate = matchingStories[0];

    if (storyToUpdate.status === 'completed') {
      console.log(`✓ Already complete: ${storyToUpdate.story_id} - ${storyToUpdate.title}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('user_stories')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', storyToUpdate.id);

    if (updateError) {
      console.error(`Error updating ${storyToUpdate.story_id}:`, updateError.message);
    } else {
      console.log(`✅ Updated: ${storyToUpdate.story_id} - ${storyToUpdate.title}`);
      console.log(`   Reason: ${story.reason}`);
    }
  }

  // Query final counts
  console.log('\n--- Final User Story Status ---');
  const { data: allStories, error: countError } = await supabase
    .from('user_stories')
    .select('story_id, title, status, story_points')
    .eq('sd_id', 'SD-VWC-PHASE1-001')
    .order('story_id');

  if (countError) {
    console.error('Error fetching final counts:', countError.message);
  } else {
    const completed = allStories.filter(s => s.status === 'completed');
    const totalPoints = allStories.reduce((sum, s) => sum + (s.story_points || 0), 0);
    const completedPoints = completed.reduce((sum, s) => sum + (s.story_points || 0), 0);

    console.log(`Total Stories: ${completed.length}/${allStories.length} completed (${Math.round(completed.length/allStories.length*100)}%)`);
    console.log(`Story Points: ${completedPoints}/${totalPoints} completed (${Math.round(completedPoints/totalPoints*100)}%)`);

    console.log('\nCompleted Stories:');
    completed.forEach(s => {
      console.log(`  ✅ ${s.story_id} (${s.story_points}pts): ${s.title}`);
    });

    const incomplete = allStories.filter(s => s.status !== 'completed');
    if (incomplete.length > 0) {
      console.log('\nIncomplete Stories:');
      incomplete.forEach(s => {
        console.log(`  ⏳ ${s.story_id} (${s.story_points}pts): ${s.title}`);
      });
    }
  }
}

updateRemainingStories()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Script error:', err);
    process.exit(1);
  });
