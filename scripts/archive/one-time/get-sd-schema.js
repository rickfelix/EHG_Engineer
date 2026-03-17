#!/usr/bin/env node
/**
 * Get strategic_directives_v2 table schema
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function getSDSchema() {
  console.log('🔍 Fetching strategic_directives_v2 table schema...\n');

  try {
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

    // Get sample record to see structure
    const { data: samples, error: sampleError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2);

    if (sampleError) {
      console.error('❌ Error fetching sample records:', sampleError);
      process.exit(1);
    }

    console.log('=== SAMPLE RECORDS (2 most recent) ===\n');
    console.log(JSON.stringify(samples, null, 2));

    // Get column info from information_schema
    const { data: columns, error: colError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = 'strategic_directives_v2'
          ORDER BY ordinal_position;
        `
      });

    if (!colError && columns) {
      console.log('\n\n=== COLUMN DEFINITIONS ===\n');
      console.log(JSON.stringify(columns, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getSDSchema();
