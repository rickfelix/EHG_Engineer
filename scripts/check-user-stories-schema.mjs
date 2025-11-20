#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Query information_schema to get actual table structure
const { data, error } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      column_name, 
      data_type, 
      is_nullable, 
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'user_stories'
    ORDER BY ordinal_position;
  `
});

if (error) {
  console.error('Error querying schema:', error.message);
  
  // Alternative: Try to insert an empty record and see what fields are required
  console.log('\n📋 Attempting to discover required fields via test insert...');
  const { error: insertError } = await supabase
    .from('user_stories')
    .insert({
      id: '00000000-0000-0000-0000-000000000000'
    })
    .select();
  
  if (insertError) {
    console.log('Insert error reveals required fields:');
    console.log(insertError.message);
  }
  process.exit(1);
}

console.log('📊 USER_STORIES TABLE SCHEMA:');
console.log('═'.repeat(80));
data.forEach(col => {
  const nullable = col.is_nullable === 'NO' ? '❌ NOT NULL' : '✅ NULL OK';
  const def = col.column_default ? ` (default: ${col.column_default})` : '';
  console.log(`${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${nullable}${def}`);
});
