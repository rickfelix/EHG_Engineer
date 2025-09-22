#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkBacklogStructure() {
  console.log('Checking structure of main backlog tables...\n');

  // Insert a test record to see the structure
  const tables = ['eng_backlog', 'backlog', 'backlog_items'];

  for (const tableName of tables) {
    console.log(`\n=== ${tableName} ===`);

    // Try to insert a minimal test record to see what columns are required
    const { data, error } = await supabase
      .from(tableName)
      .insert([{
        id: crypto.randomUUID(),
        title: 'Test Item',
        description: 'Test Description',
        priority: 'P1',
        status: 'todo'
      }])
      .select();

    if (error) {
      console.log('Error inserting:', error.message);

      // Try with less fields
      const { data: minimalData, error: minimalError } = await supabase
        .from(tableName)
        .insert([{ title: 'Test' }])
        .select();

      if (minimalError) {
        console.log('Minimal insert error:', minimalError.message);
      } else if (minimalData) {
        console.log('Created with minimal data:', minimalData[0]);
        console.log('Columns:', Object.keys(minimalData[0]));

        // Clean up
        await supabase.from(tableName).delete().eq('id', minimalData[0].id);
      }
    } else if (data) {
      console.log('Created successfully:', data[0]);
      console.log('Columns:', Object.keys(data[0]));

      // Clean up
      await supabase.from(tableName).delete().eq('id', data[0].id);
    }
  }
}

checkBacklogStructure();