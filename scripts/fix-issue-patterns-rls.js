#!/usr/bin/env node
/**
 * Fix RLS policies for issue_patterns table
 * Allow read/write access for the learning history system
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function fixRLS() {
  console.log('\n🔧 Fixing RLS policies for issue_patterns table...\n');

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Drop existing restrictive policies
    console.log('🗑️  Removing old policies...');
    await client.query(`
      DROP POLICY IF EXISTS "Allow authenticated users to read patterns" ON issue_patterns;
    `);
    await client.query(`
      DROP POLICY IF EXISTS "Allow authenticated users to manage patterns" ON issue_patterns;
    `);
    console.log('✅ Old policies removed\n');

    // Create new permissive policies
    console.log('📝 Creating new policies...');

    // Allow everyone to read patterns
    await client.query(`
      CREATE POLICY "Allow all to read patterns"
        ON issue_patterns
        FOR SELECT
        USING (true);
    `);
    console.log('✅ Created read policy');

    // Allow everyone to insert patterns
    await client.query(`
      CREATE POLICY "Allow all to insert patterns"
        ON issue_patterns
        FOR INSERT
        WITH CHECK (true);
    `);
    console.log('✅ Created insert policy');

    // Allow everyone to update patterns
    await client.query(`
      CREATE POLICY "Allow all to update patterns"
        ON issue_patterns
        FOR UPDATE
        USING (true)
        WITH CHECK (true);
    `);
    console.log('✅ Created update policy\n');

    // Verify policies
    const { rows } = await client.query(`
      SELECT policyname, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename = 'issue_patterns'
      ORDER BY policyname;
    `);

    console.log('📋 Current policies:');
    rows.forEach(policy => {
      console.log(`  - ${policy.policyname} (${policy.cmd})`);
    });

    // Test read access
    console.log('\n🧪 Testing read access...');
    const { rows: patterns } = await client.query(`
      SELECT pattern_id, category, issue_summary
      FROM issue_patterns
      ORDER BY pattern_id
      LIMIT 5;
    `);

    if (patterns.length > 0) {
      console.log(`✅ Can read ${patterns.length} pattern(s):`);
      patterns.forEach(p => {
        console.log(`  - ${p.pattern_id}: ${p.issue_summary.substring(0, 50)}...`);
      });
    } else {
      console.log('⚠️  No patterns found (table might be empty)');
    }

    console.log('\n✨ RLS policies fixed! System is ready to use.\n');
    console.log('Test it now:');
    console.log('  node scripts/search-prior-issues.js "database"\n');

    await client.end();

  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    console.error('Full error:', error);
    await client.end();
    process.exit(1);
  }
}

fixRLS();
