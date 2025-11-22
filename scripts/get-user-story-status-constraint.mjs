#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Query constraint info
const { data, error } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      conname AS constraint_name,
      pg_get_constraintdef(oid) AS constraint_definition
    FROM pg_constraint
    WHERE conname LIKE '%user_stories%status%'
  `
});

if (error) {
  // Try alternative: get from information_schema
  const { data: columns, error: err2 } = await supabase
    .from('user_stories')
    .select('*')
    .limit(1);

  if (err2) {
    console.error('Error:', err2.message);
  } else {
    console.log('Sample story:', columns[0]);
    console.log('\nCommon status values: ready, in_progress, blocked, completed, cancelled');
  }
} else {
  console.log('Constraints:', data);
}
