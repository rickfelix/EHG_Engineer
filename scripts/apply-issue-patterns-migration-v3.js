#!/usr/bin/env node
/**
 * Apply issue_patterns migration - Attempt #3
 * Execute entire SQL file as single query (PostgreSQL can handle it)
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function applyMigration() {
  console.log('\n🔄 Applying issue_patterns migration (Attempt #3 - Single Query)...\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found');
    process.exit(1);
  }

  console.log('✅ Connection string loaded');
  console.log(`📡 Target: ${poolerUrl.match(/aws-[^.]+/)[0]} region\n`);

  const client = new Client({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  });

  try {
    console.log('🔌 Connecting...');
    await client.connect();
    console.log('✅ Connected!\n');

    // Read migration file
    const migrationPath = path.join(process.cwd(), 'database/migrations/create-issue-patterns-table.sql');
    const sql = await fs.readFile(migrationPath, 'utf-8');
    console.log(`📖 Loaded migration (${sql.split('\n').length} lines)\n`);

    // Execute entire SQL file at once
    // PostgreSQL can handle multiple statements in one query
    console.log('⚙️  Executing migration (this may take 10-30 seconds)...\n');

    const _result = await client.query(sql);

    console.log('✅ Migration executed successfully!\n');

    // Verify
    console.log('🔍 Verifying...');
    const { rows: count } = await client.query('SELECT COUNT(*) as count FROM issue_patterns');
    console.log(`📊 issue_patterns table has ${count[0].count} row(s)`);

    if (parseInt(count[0].count) > 0) {
      const { rows: categories } = await client.query(`
        SELECT category, COUNT(*) as count
        FROM issue_patterns
        GROUP BY category
        ORDER BY count DESC
        LIMIT 5;
      `);

      console.log('\n📋 Sample patterns:');
      categories.forEach(c => console.log(`  - ${c.category}: ${c.count}`));
    }

    console.log('\n✨ Success! Learning history system is ready.\n');
    console.log('Test it:');
    console.log('  node scripts/search-prior-issues.js "database schema"\n');

    await client.end();

  } catch (error) {
    console.error('\n❌ Failed:', error.message);

    // Check if it's a "table already exists" error
    if (error.message.includes('already exists')) {
      console.log('\n💡 Table might already exist. Checking...\n');

      try {
        const { rows } = await client.query('SELECT COUNT(*) FROM issue_patterns');
        console.log(`✅ Table exists with ${rows[0].count} patterns!`);
        console.log('\n🎉 System is already set up. You can use it now.\n');
        await client.end();
        return;
      } catch (e) {
        console.error('Cannot verify table:', e.message);
      }
    }

    console.error('\nFull error:', error);
    await client.end();
    process.exit(1);
  }
}

applyMigration();
