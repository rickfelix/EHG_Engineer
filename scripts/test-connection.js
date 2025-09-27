#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient  } from '@supabase/supabase-js';

console.log('Testing Supabase connection...');
console.log('URL:', process.env.SUPABASE_URL);
console.log('Using key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testConnection() {
  try {
    // Try a simple query
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);

    if (error) {
      console.log('Error querying strategic_directives_v2:', error.message);
    } else {
      console.log('✅ Successfully connected! Found', data?.length || 0, 'records');
    }

    // Check what tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', '%backlog%')
      .limit(10);

    if (!tablesError && tables) {
      console.log('Tables with "backlog":', tables);
    }

  } catch (err) {
    console.error('Connection error:', err);
  }
}

testConnection();