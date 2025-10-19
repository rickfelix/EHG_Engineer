/**
 * List all tables in EHG application database
 */

const { createClient } = require('@supabase/supabase-js');

const EHG_SUPABASE_URL = 'https://liapbndqlqxdcgpwntbv.supabase.co';
const EHG_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzI4MzcsImV4cCI6MjA3MTk0ODgzN30.YlzzH17RYHsFs3TBmKlbmZPJYfUEWU71cAURwTsu8-M';

const supabase = createClient(EHG_SUPABASE_URL, EHG_SUPABASE_ANON_KEY);

async function listTables() {
  console.log('\n🔍 Listing all tables in EHG database (liapbndqlqxdcgpwntbv)\n');

  // Query to get all tables in public schema
  const { data, error } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `
    });

  if (error) {
    // If RPC doesn't work, try a different approach
    console.log('RPC approach failed, trying alternative...\n');

    // Try querying a few known tables to see which exist
    const testTables = [
      'ai_ceo_agents',
      'crewai_agents',
      'agent_departments',
      'crewai_crews',
      'crew_members',
      'ventures',
      'companies',
      'users',
      'migrations'
    ];

    console.log('Testing known tables:\n');
    for (const table of testTables) {
      const { data, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${table}: NOT FOUND (${error.message})`);
      } else {
        console.log(`✓ ${table}: EXISTS`);
      }
    }
  } else {
    console.log('Tables found:', data);
  }
}

listTables().catch(console.error);
