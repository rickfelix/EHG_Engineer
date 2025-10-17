#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// EHG App database
const ehgClient = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.EHG_SUPABASE_ANON_KEY
);

async function main() {
  console.log('🔍 Checking EHG App board_members table schema...\n');

  // Try to get one row to see the structure
  const { data, error } = await ehgClient
    .from('board_members')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Table might be empty or have different schema. Error:', error.message);
    console.log('\nTrying to get schema from metadata...');

    // If no data exists, we need to check the actual schema
    // Let's try to insert a minimal test record and see what's required
    console.log('\nAttempting test insert to discover required columns...');
    const testData = {
      board_role: 'Test Role',
      status: 'active'
    };

    const { data: testInsert, error: insertError } = await ehgClient
      .from('board_members')
      .insert(testData)
      .select();

    if (insertError) {
      console.log('Test insert error:', insertError.message);
      console.log('This helps us understand required columns');
    } else {
      console.log('Test insert succeeded! Schema includes:');
      console.log(JSON.stringify(testInsert, null, 2));

      // Clean up test record
      await ehgClient.from('board_members').delete().eq('board_role', 'Test Role');
      console.log('\nTest record cleaned up');
    }
  } else {
    if (data && data.length > 0) {
      console.log('✅ Table structure from existing record:');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('Table exists but is empty');
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
});
