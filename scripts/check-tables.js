#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient  } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkTables() {
  try {
    // Query for backlog related tables
    const { data: _data, error: _error } = await supabase
      .rpc('get_table_list', {})
      .catch(() => null);

    // If RPC doesn't exist, try direct query
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND (table_name LIKE '%backlog%' OR table_name LIKE 'eng_%')
      ORDER BY table_name;
    `;

    const { data: tables, error: _queryError } = await supabase
      .rpc('query', { sql: query })
      .catch(() => ({ data: null, error: 'RPC not available' }));

    if (tables) {
      console.log('Tables found:', tables);
    } else {
      console.log('Could not query tables via RPC. Tables that exist based on your queries:');
      console.log('- strategic_directives_v2');
      console.log('- product_requirements_v2');
      console.log('- eng_backlog (may not exist yet)');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkTables();