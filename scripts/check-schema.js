#!/usr/bin/env node

/**
 * Check actual database schema for strategic_directives_v2
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log('🔍 Checking strategic_directives_v2 schema...\n');

  // Try to fetch one record to see available columns
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No records found in table');

    // Try to insert a minimal record to see what's required
    const { error: insertError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: 'SD-SCHEMA-TEST',
        title: 'Schema Test',
        category: 'test',
        priority: 'low',
        description: 'Test',
        rationale: 'Test',
        scope: 'Test'
      });

    if (insertError) {
      console.log('\n❌ Insert error:', insertError.message);
      console.log('This tells us what columns are required or invalid');
    } else {
      console.log('\n✅ Successfully inserted test record');

      // Fetch it back
      const { data: testData } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', 'SD-SCHEMA-TEST')
        .single();

      console.log('\n📋 Available columns:');
      console.log(Object.keys(testData).sort().join(', '));

      // Delete test record
      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', 'SD-SCHEMA-TEST');
    }
  } else {
    console.log('📋 Available columns:');
    console.log(Object.keys(data[0]).sort().join(', '));

    console.log('\n📊 Sample record:');
    console.log(JSON.stringify(data[0], null, 2));
  }
}

checkSchema().then(() => process.exit(0));
