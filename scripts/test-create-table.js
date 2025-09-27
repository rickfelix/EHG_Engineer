#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient  } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testCreateTable() {
  console.log('Testing table creation capabilities...\n');

  // Try to create a simple test table
  const { data, error } = await supabase
    .from('test_table_delete_me')
    .insert([
      { test_field: 'test_value' }
    ]);

  if (error) {
    console.log('❌ Cannot create/insert into new table:', error.message);
    console.log('\nThis is expected with ANON key - it has limited permissions.');
  } else {
    console.log('✅ Successfully created/inserted into table!');

    // Try to clean up
    const { error: deleteError } = await supabase
      .from('test_table_delete_me')
      .delete()
      .eq('test_field', 'test_value');

    if (!deleteError) {
      console.log('Cleaned up test data');
    }
  }

  // Check if we can alter existing tables
  console.log('\nTrying to insert test data into existing table...');
  const { data: testInsert, error: insertError } = await supabase
    .from('strategic_directives_v2')
    .insert([
      {
        id: crypto.randomUUID(),
        title: 'TEST_DELETE_ME',
        category: 'Technical',
        priority: 'low',
        description: 'Test entry',
        rationale: 'Testing permissions',
        scope: 'Test only',
        status: 'draft',
        version: '1.0'
      }
    ])
    .select();

  if (insertError) {
    console.log('❌ Cannot insert into existing table:', insertError.message);
  } else {
    console.log('✅ Can insert! Created record with ID:', testInsert[0]?.id);

    // Clean up
    if (testInsert[0]?.id) {
      const { error: cleanupError } = await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', testInsert[0].id);

      if (!cleanupError) {
        console.log('Cleaned up test record');
      }
    }
  }
}

testCreateTable();