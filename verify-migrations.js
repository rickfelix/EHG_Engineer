#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkMigrations() {
  console.log('🔍 Checking Migration Status...\n');

  // Check Checkpoint 1: New columns
  console.log('Checkpoint 1: Database Schema & Multi-Application Context');
  console.log('─'.repeat(60));
  
  const checkpoint1Columns = [
    'target_application',
    'learning_category', 
    'applies_to_all_apps',
    'related_files',
    'related_commits',
    'related_prs',
    'affected_components',
    'tags'
  ];

  let checkpoint1Deployed = true;
  for (const col of checkpoint1Columns) {
    const { data, error } = await supabase
      .from('retrospectives')
      .select(col)
      .limit(1);
    
    if (error && error.message.includes('column') && error.message.includes('does not exist')) {
      console.log(`❌ ${col} - NOT FOUND`);
      checkpoint1Deployed = false;
    } else if (error) {
      console.log(`⚠️  ${col} - ERROR: ${error.message}`);
      checkpoint1Deployed = false;
    } else {
      console.log(`✅ ${col} - EXISTS`);
    }
  }

  console.log(`\nCheckpoint 1: ${checkpoint1Deployed ? '✅ DEPLOYED' : '❌ NOT DEPLOYED'}\n`);

  // Check Checkpoint 2: content_embedding column
  console.log('Checkpoint 2: Semantic Search Infrastructure');
  console.log('─'.repeat(60));
  
  const { data: embData, error: embError } = await supabase
    .from('retrospectives')
    .select('content_embedding')
    .limit(1);

  let checkpoint2Deployed = false;
  if (embError && embError.message.includes('column') && embError.message.includes('does not exist')) {
    console.log('❌ content_embedding - NOT FOUND');
  } else if (embError) {
    console.log(`⚠️  content_embedding - ERROR: ${embError.message}`);
  } else {
    console.log('✅ content_embedding - EXISTS');
    checkpoint2Deployed = true;
  }

  console.log(`\nCheckpoint 2: ${checkpoint2Deployed ? '✅ DEPLOYED' : '❌ NOT DEPLOYED'}\n`);

  // Summary
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  if (!checkpoint1Deployed) {
    console.log('⚠️  Checkpoint 1 migration needs to be deployed');
    console.log('   File: database/migrations/20251016_enhance_retrospectives_multi_app_context.sql');
    console.log('   Deploy via: Supabase Dashboard → SQL Editor');
  }
  
  if (!checkpoint2Deployed) {
    console.log('⚠️  Checkpoint 2 migration needs to be deployed');
    console.log('   File: database/migrations/20251016_add_vector_search_embeddings.sql');
    console.log('   Deploy via: Supabase Dashboard → SQL Editor');
  }

  if (checkpoint1Deployed && checkpoint2Deployed) {
    console.log('✅ All migrations deployed! Ready for backfill and embedding generation.');
  }
}

checkMigrations().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
