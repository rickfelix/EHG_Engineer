#!/usr/bin/env node
/**
 * Apply issue_patterns migration - Attempt #2
 * Using direct connection with better error handling and reconnection logic
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function executeWithRetry(client, sql, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await client.query(sql);
      return result;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`  ⚠️  Retry ${i + 1}/${retries} after error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

async function applyMigration() {
  console.log('\n🔄 Applying issue_patterns migration (Attempt #2)...\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found in environment');
    console.log('Expected in .env file:');
    console.log('SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:...');
    process.exit(1);
  }

  console.log('✅ Found SUPABASE_POOLER_URL');
  console.log(`📡 Connecting to: ${poolerUrl.replace(/:[^:@]+@/, ':***@')}\n`);

  const client = new Client({
    connectionString: poolerUrl,
    ssl: {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined // Disable hostname verification
    },
    connectionTimeoutMillis: 15000,
    query_timeout: 30000,
    statement_timeout: 30000,
    keepAlive: true
  });

  try {
    // Connect with timeout
    console.log('🔌 Connecting to database...');
    await Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout after 10s')), 10000)
      )
    ]);
    console.log('✅ Connected successfully!\n');

    // Test connection
    const { rows } = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log(`📅 Database time: ${rows[0].current_time}`);
    console.log(`🐘 PostgreSQL: ${rows[0].pg_version.split(',')[0]}\n`);

    // Read migration file
    const migrationPath = path.join(
      process.cwd(),
      'database/migrations/create-issue-patterns-table.sql'
    );

    console.log('📖 Reading migration file...');
    const sql = await fs.readFile(migrationPath, 'utf-8');
    console.log(`✅ Read ${sql.split('\n').length} lines\n`);

    // Start transaction
    console.log('🔐 Starting transaction...');
    await client.query('BEGIN');
    console.log('✅ Transaction started\n');

    // Split and execute statements
    console.log('⚙️  Executing migration statements:\n');

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt || stmt === ';') continue;

      const fullStmt = stmt + ';';

      try {
        // Show progress for major operations
        if (stmt.includes('CREATE TABLE')) {
          process.stdout.write('  📦 Creating issue_patterns table...');
        } else if (stmt.includes('CREATE INDEX') && stmt.includes('idx_')) {
          const match = stmt.match(/idx_\w+/);
          if (match) process.stdout.write(`  📇 Creating index ${match[0]}...`);
        } else if (stmt.includes('CREATE FUNCTION')) {
          const match = stmt.match(/FUNCTION\s+(\w+)/);
          if (match) process.stdout.write(`  ⚙️  Creating function ${match[1]}...`);
        } else if (stmt.includes('CREATE TRIGGER')) {
          process.stdout.write('  🔔 Creating trigger...');
        } else if (stmt.includes('CREATE EXTENSION')) {
          const match = stmt.match(/EXTENSION.*?"(\w+)"/);
          if (match) process.stdout.write(`  🔌 Enabling extension ${match[1]}...`);
        } else if (stmt.includes('INSERT INTO')) {
          process.stdout.write('  🌱 Seeding patterns...');
        } else if (stmt.includes('CREATE VIEW')) {
          process.stdout.write('  👁️  Creating view...');
        } else if (stmt.includes('CREATE POLICY')) {
          process.stdout.write('  🛡️  Creating RLS policy...');
        }

        await executeWithRetry(client, fullStmt);

        if (process.stdout.isTTY) {
          process.stdout.write(' ✅\n');
        }
        successCount++;

      } catch (error) {
        // Handle "already exists" gracefully
        if (error.message.includes('already exists') || error.code === '42P07') {
          if (process.stdout.isTTY) {
            process.stdout.write(' ⏭️  (already exists)\n');
          }
          skipCount++;
        } else {
          console.error(`\n  ❌ Error: ${error.message}`);
          console.error(`  Statement: ${stmt.substring(0, 100)}...`);
          throw error;
        }
      }
    }

    // Commit transaction
    console.log('\n💾 Committing transaction...');
    await client.query('COMMIT');
    console.log('✅ Transaction committed!\n');

    console.log('📊 Summary:');
    console.log(`  ✅ Executed: ${successCount}`);
    console.log(`  ⏭️  Skipped: ${skipCount}`);
    console.log(`  📝 Total: ${statements.length}\n`);

    // Verify the table
    console.log('🔍 Verifying table creation...');
    const { rows: tableCheck } = await client.query(`
      SELECT COUNT(*) as pattern_count
      FROM issue_patterns;
    `);

    console.log(`✅ issue_patterns table exists with ${tableCheck[0].pattern_count} row(s)\n`);

    // Show pattern categories if any exist
    if (parseInt(tableCheck[0].pattern_count) > 0) {
      const { rows: categories } = await client.query(`
        SELECT category, COUNT(*) as count
        FROM issue_patterns
        GROUP BY category
        ORDER BY count DESC;
      `);

      console.log('📋 Patterns by category:');
      categories.forEach(cat => {
        console.log(`  - ${cat.category}: ${cat.count}`);
      });
    }

    console.log('\n✨ Migration completed successfully!\n');
    console.log('Next steps:');
    console.log('  1. Test search: node scripts/search-prior-issues.js "database schema"');
    console.log('  2. View all: node scripts/search-prior-issues.js --list');
    console.log('  3. Show stats: node scripts/search-prior-issues.js --stats\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);

    try {
      await client.query('ROLLBACK');
      console.log('↩️  Transaction rolled back');
    } catch (rollbackError) {
      console.error('⚠️  Rollback also failed:', rollbackError.message);
    }

    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    try {
      await client.end();
      console.log('👋 Connection closed\n');
    } catch (e) {
      // Ignore close errors
    }
  }
}

applyMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
