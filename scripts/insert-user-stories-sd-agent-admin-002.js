#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function insertUserStories() {
  console.log('\n📝 Inserting User Stories for SD-AGENT-ADMIN-002...\n');

  // Read user stories from JSON file
  const userStoriesData = JSON.parse(
    readFileSync('/tmp/user-stories-sd-agent-admin-002.json', 'utf-8')
  );

  const sd_id = 'SD-AGENT-ADMIN-002';
  // Generate a proper UUID for the import run
  const import_run_id = crypto.randomUUID();

  // Prepare backlog items for insertion
  const backlogItems = [];
  let sequence_no = 1;

  // Iterate through each subsystem
  for (const [subsystemKey, subsystemData] of Object.entries(userStoriesData.stories_by_subsystem)) {
    console.log(`Processing subsystem: ${subsystemKey}...`);

    for (const story of subsystemData.stories) {
      const backlogItem = {
        sd_id: sd_id,
        backlog_id: story.id,
        backlog_title: story.title,
        item_description: subsystemKey.replace(/_/g, ' ').toUpperCase(),
        description_raw: story.priority === 'CRITICAL' || story.priority === 'HIGH' ? 'Must Have' : 'Nice to Have',
        priority: story.priority,
        sequence_no: sequence_no++,
        story_key: story.id,
        story_title: story.title,
        story_description: story.title,
        acceptance_criteria: JSON.stringify(story.acceptance_criteria), // Convert array to JSON string
        story_import_run_id: import_run_id,
        completion_status: 'NOT_STARTED',
        phase: 'Planning',
        item_type: 'story', // Lowercase to match existing data
        new_module: true, // Boolean, not string
        extras: {
          subsystem: subsystemKey,
          story_points: story.story_points,
          priority: story.priority,
          actor: story.title.match(/As an? ([^,]+),/)?.[1] || 'Unknown'
        },
        verification_status: 'not_run', // Match existing format
        present_in_latest_import: true
      };

      backlogItems.push(backlogItem);
    }
  }

  console.log(`\nPrepared ${backlogItems.length} backlog items for insertion.`);
  console.log(`Total story points: ${userStoriesData.total_story_points}`);

  // Insert in batches (Supabase limit is typically 1000 per batch)
  const batchSize = 50;
  for (let i = 0; i < backlogItems.length; i += batchSize) {
    const batch = backlogItems.slice(i, i + batchSize);
    console.log(`\nInserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)...`);

    const { data, error } = await supabase
      .from('sd_backlog_map')
      .insert(batch)
      .select();

    if (error) {
      console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      console.error('Error details:', error);
      process.exit(1);
    } else {
      console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} inserted successfully (${data.length} rows)`);
    }
  }

  // Verify insertion
  const { data: verifyData, error: verifyError } = await supabase
    .from('sd_backlog_map')
    .select('*', { count: 'exact' })
    .eq('sd_id', sd_id);

  if (!verifyError) {
    console.log(`\n✅ Verification: ${verifyData.length} total backlog items for ${sd_id}`);

    // Group by subsystem
    const bySubsystem = {};
    verifyData.forEach(item => {
      const subsystem = item.new_module || 'unknown';
      if (!bySubsystem[subsystem]) {
        bySubsystem[subsystem] = [];
      }
      bySubsystem[subsystem].push(item);
    });

    console.log('\nBreakdown by subsystem:');
    for (const [subsystem, items] of Object.entries(bySubsystem)) {
      const totalSP = items.reduce((sum, item) => sum + (item.extras?.story_points || 0), 0);
      console.log(`  - ${subsystem}: ${items.length} stories, ${totalSP} story points`);
    }
  } else {
    console.error('❌ Verification failed:', verifyError.message);
  }

  console.log('\n✅ User stories insertion complete!\n');
}

insertUserStories().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
