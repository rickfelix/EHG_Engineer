#!/usr/bin/env node

/**
 * Delete existing user stories for SD-AGENT-PLATFORM-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function deleteUserStories() {
  console.log('🗑️ Deleting existing user stories for SD-AGENT-PLATFORM-001...');
  console.log('='.repeat(80));

  try {
    const { data, error } = await supabase
      .from('user_stories')
      .delete()
      .eq('sd_id', 'SD-AGENT-PLATFORM-001')
      .select();

    if (error) throw error;

    console.log(`✅ Deleted ${data.length} user stories`);
    data.forEach((story, i) => {
      console.log(`${i + 1}. ${story.story_key}: ${story.title}`);
    });
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error deleting user stories:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deleteUserStories();
}

export { deleteUserStories };
