#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Query User Stories - try different table names
console.log('Trying to query user stories...\n');

// Try user_stories
const { data: stories1, error: error1 } = await supabase
  .from('user_stories')
  .select('*')
  .eq('sd_id', 'SD-STAGE4-AGENT-PROGRESS-001');

if (!error1) {
  console.log('='.repeat(80));
  console.log('USER STORIES FROM user_stories TABLE');
  console.log('='.repeat(80));
  console.log(JSON.stringify(stories1, null, 2));
} else {
  console.log('Error with user_stories:', error1.message);
}

// Try to get table information
const { data: tables } = await supabase
  .from('information_schema.tables')
  .select('table_name')
  .like('table_name', '%user_stor%');

console.log('\n' + '='.repeat(80));
console.log('AVAILABLE USER STORY TABLES');
console.log('='.repeat(80));
console.log(JSON.stringify(tables, null, 2));
