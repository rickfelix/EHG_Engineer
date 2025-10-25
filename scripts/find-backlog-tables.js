#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient  } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function findBacklogTables() {
  console.log('Searching for backlog-related tables...\n');

  // Check common backlog table names
  const tableNames = [
    'backlog',
    'backlogs',
    'eng_backlog',
    'backlog_items',
    'backlog_tasks',
    'backlog_stories',
    'backlog_epics',
    'engineering_backlog',
    'project_backlog',
    'product_backlog'
  ];

  for (const tableName of tableNames) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (!error) {
      console.log(`✅ Found table: ${tableName} (${count || 0} records)`);

      // Get sample columns
      const { data: sample, error: sampleError } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (!sampleError && sample && sample.length > 0) {
        console.log('   Columns:', Object.keys(sample[0]).slice(0, 10).join(', '));
      }
    }
  }

  // Also check for any tables with 'task' or 'story' in the name
  console.log('\nChecking for task/story related tables...');
  const otherTables = ['tasks', 'stories', 'epics', 'work_items', 'tickets'];

  for (const tableName of otherTables) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (!error) {
      console.log(`✅ Found table: ${tableName} (${count || 0} records)`);
    }
  }
}

findBacklogTables();