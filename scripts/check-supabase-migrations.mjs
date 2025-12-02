#!/usr/bin/env node

/**
 * Check which migrations have been applied to Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkMigrations() {
  try {
    console.log('=== CHECKING SUPABASE MIGRATION HISTORY ===\n');

    // Try to query the schema_migrations table
    const { data, error } = await supabase
      .from('supabase_migrations')
      .select('*')
      .order('version', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error querying migrations table:', error.message);
      console.log('\nNote: The supabase_migrations table may not be accessible via anon key.');
      console.log('This is expected. We need to check differently.\n');

      // Try alternative approach: check if columns exist by attempting a select
      console.log('=== ALTERNATIVE: CHECKING COLUMN EXISTENCE ===\n');

      const { data: testData, error: testError } = await supabase
        .from('crewai_agents')
        .select('id,verbose,memory_enabled,reasoning_enabled')
        .limit(0);

      if (testError) {
        if (testError.message.includes('column') && testError.message.includes('does not exist')) {
          const missingColumn = testError.message.match(/column "([^"]+)"/)?.[1];
          console.log(`✗ Column "${missingColumn}" does NOT exist`);
          console.log('This suggests the migration has NOT been applied yet.\n');
        } else {
          console.error('Unexpected error:', testError);
        }
      } else {
        console.log('✓ Columns verbose, memory_enabled, reasoning_enabled exist');
        console.log('This suggests the migration HAS been applied.\n');
      }

      return;
    }

    if (!data || data.length === 0) {
      console.log('No migration history found.');
      return;
    }

    console.log('Recent migrations:');
    data.forEach(migration => {
      console.log(`  ${migration.version} - ${migration.name || 'unnamed'}`);
    });

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkMigrations();
