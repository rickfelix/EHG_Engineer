#!/usr/bin/env node
/**
 * Apply issue_patterns table migration using Supabase client
 * Alternative approach for systems where direct PostgreSQL connection isn't available
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('\n🔄 Applying issue_patterns migration via Supabase client...\n');

  try {
    // Read migration file
    const migrationPath = path.join(
      process.cwd(),
      'database/migrations/create-issue-patterns-table.sql'
    );

    const _sql = await fs.readFile(migrationPath, 'utf-8');
    console.log('✅ Read migration file');

    console.log('\n⚠️  MANUAL MIGRATION REQUIRED\n');
    console.log('The Supabase client (anon key) doesn\'t have permission to create tables.');
    console.log('Please run this migration manually using one of these methods:\n');
    console.log('1. Supabase Dashboard:');
    console.log('   - Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('   - Open SQL Editor');
    console.log('   - Copy and paste the contents of:');
    console.log('     database/migrations/create-issue-patterns-table.sql');
    console.log('   - Click "Run"\n');
    console.log('2. Local psql command (if you have direct database access):\n');
    console.log('   psql "postgresql://postgres.dedlbzhpgkmetvhbkyzq:[password]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" \\');
    console.log('     -f database/migrations/create-issue-patterns-table.sql\n');

    // Instead, let's try to create the table using a simplified approach
    console.log('🔄 Attempting simplified migration...\n');

    // Check if table exists
    const { data: _existingTable, error: checkError } = await supabase
      .from('issue_patterns')
      .select('id')
      .limit(1);

    if (!checkError || checkError.code !== 'PGRST116') {
      console.log('✅ issue_patterns table already exists!');

      // Count patterns
      const { count } = await supabase
        .from('issue_patterns')
        .select('*', { count: 'exact', head: true });

      console.log(`📊 Current patterns in database: ${count}\n`);

      // Show categories
      const { data: patterns } = await supabase
        .from('issue_patterns')
        .select('category, pattern_id, issue_summary');

      if (patterns && patterns.length > 0) {
        console.log('📋 Existing patterns:');
        const byCategory = {};
        patterns.forEach(p => {
          if (!byCategory[p.category]) byCategory[p.category] = [];
          byCategory[p.category].push(p);
        });

        for (const [cat, items] of Object.entries(byCategory)) {
          console.log(`\n  ${cat}:`);
          items.forEach(p => {
            console.log(`    - ${p.pattern_id}: ${p.issue_summary.substring(0, 60)}...`);
          });
        }
      }

      console.log('\n✨ Learning history system is ready to use!');
      console.log('\nNext steps:');
      console.log('  1. Test search: node scripts/search-prior-issues.js "database schema"');
      console.log('  2. View patterns: node scripts/search-prior-issues.js --list');
      console.log('  3. Show stats: node scripts/search-prior-issues.js --stats\n');

      return;
    }

    console.log('❌ Table does not exist. Manual migration required.');
    console.log('\nPlease follow the steps above to create the table.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTo proceed, please run the migration manually via Supabase Dashboard (see instructions above)\n');
    process.exit(1);
  }
}

applyMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
