#!/usr/bin/env node
/**
 * Get get_progress_breakdown RPC function definition
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getFunctionDef() {
  console.log('📜 Fetching get_progress_breakdown function definition\n');

  // Query pg_catalog for function definition
  const { data, error } = await supabase
    .rpc('exec_raw_sql', {
      sql: `
        SELECT 
          pg_get_functiondef(p.oid) as definition,
          p.proname as name,
          pg_catalog.pg_get_function_arguments(p.oid) as arguments
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'get_progress_breakdown'
      `
    });

  if (error) {
    console.log('Could not fetch via exec_raw_sql (expected):', error.message);
    console.log('\nAlternative: Searching for migration files...\n');
    
    // Search for migration files
    const fs = await import('fs');
    const path = await import('path');
    const glob = await import('glob');
    
    const migrationDir = './database/migrations';
    const files = glob.sync(`${migrationDir}/*progress*.sql`);
    
    if (files.length === 0) {
      console.log('No migration files found with "progress" in name');
      return;
    }
    
    console.log(`Found ${files.length} migration file(s):`);
    files.forEach(f => console.log(`  - ${path.basename(f)}`));
    
    // Read and display relevant sections
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('get_progress_breakdown')) {
        console.log(`\n📄 ${path.basename(file)}:`);
        console.log('='`.repeat(80));
        
        // Extract function definition
        const funcMatch = content.match(/CREATE OR REPLACE FUNCTION get_progress_breakdown[\s\S]+?END;[\s\S]+?\$\$/);
        if (funcMatch) {
          console.log(funcMatch[0]);
        } else {
          console.log('Function definition found but could not extract cleanly');
          console.log('File contains get_progress_breakdown');
        }
      }
    }
    return;
  }

  if (data && data.length > 0) {
    console.log('Function Definition:');
    console.log('='.repeat(80));
    console.log(data[0].definition);
  } else {
    console.log('Function not found');
  }
}

getFunctionDef().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
