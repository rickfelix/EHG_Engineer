import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

console.log('Checking chairman_dashboard_config table in EHG database...\n');

// EHG app database (where implementation lives)
const ehgSupabase = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.EHG_SUPABASE_ANON_KEY
);

console.log('EHG Database:', process.env.EHG_SUPABASE_URL);
console.log('');

// Try to query the table
const { data, error } = await ehgSupabase
  .from('chairman_dashboard_config')
  .select('*')
  .limit(1);

if (error) {
  if (error.code === '42P01') {
    console.log('❌ Table does NOT exist in EHG database (liapbndqlqxdcgpwntbv)');
    console.log('');
    console.log('Migration file created at:');
    console.log('  /mnt/c/_EHG/ehg/database/migrations/create-chairman-dashboard-config.sql');
    console.log('');
    console.log('Action required: Apply migration to EHG database');
  } else {
    console.log('❌ Error querying table:', error.message);
    console.log('   Code:', error.code);
  }
} else {
  console.log('✅ Table EXISTS in EHG database!');
  console.log('');
  if (data && data.length > 0) {
    console.log('Sample data found:', data.length, 'records');
    console.log('Columns:', Object.keys(data[0]).join(', '));
  } else {
    console.log('Table exists but no data yet (empty table)');
    console.log('Schema ready for use');
  }
  console.log('');
  console.log('✅ useChairmanConfig hook will save to database (not localStorage)');
}
