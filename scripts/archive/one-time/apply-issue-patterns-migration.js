#!/usr/bin/env node
/**
 * Apply issue_patterns table migration
 * Creates the learning history system database structure
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function applyMigration() {
  console.log('\n🔄 Applying issue_patterns migration...\n');

  // Connect using pooler URL for compatibility (EHG_Engineer uses aws-1 region per CLAUDE.md)
  const projectId = 'dedlbzhpgkmetvhbkyzq'; // EHG_Engineer database
  const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error('SUPABASE_DB_PASSWORD required');

  // Use environment variable first, fallback to constructed URL
  const connStr = process.env.SUPABASE_POOLER_URL ||
    `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(
      process.cwd(),
      'database/migrations/create-issue-patterns-table.sql'
    );

    const sql = await fs.readFile(migrationPath, 'utf-8');
    console.log('✅ Read migration file');

    // Execute migration in a transaction
    await client.query('BEGIN');
    console.log('\n📝 Executing migration...\n');

    // Split into statements and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';';

      // Skip empty or comment-only statements
      if (stmt.trim() === ';' || stmt.trim().startsWith('--')) continue;

      try {
        await client.query(stmt);

        // Show progress for major operations
        if (stmt.includes('CREATE TABLE')) {
          console.log('  ✅ Created issue_patterns table');
        } else if (stmt.includes('CREATE INDEX')) {
          const match = stmt.match(/CREATE INDEX.*?(idx_\w+)/);
          if (match) console.log(`  ✅ Created index: ${match[1]}`);
        } else if (stmt.includes('CREATE FUNCTION')) {
          const match = stmt.match(/CREATE.*?FUNCTION\s+(\w+)/);
          if (match) console.log(`  ✅ Created function: ${match[1]}`);
        } else if (stmt.includes('INSERT INTO')) {
          console.log('  ✅ Seeded initial patterns');
        } else if (stmt.includes('CREATE VIEW')) {
          console.log('  ✅ Created pattern_statistics view');
        }
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists')) {
          const match = error.message.match(/"(\w+)"/);
          if (match) {
            console.log(`  ℹ️  ${match[1]} already exists (skipped)`);
          }
        } else {
          throw error;
        }
      }
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!\n');

    // Verify the table was created
    const { rows } = await client.query(`
      SELECT COUNT(*) as pattern_count
      FROM issue_patterns;
    `);

    console.log(`📊 Current patterns in database: ${rows[0].pattern_count}`);

    // Show pattern categories
    const { rows: categories } = await client.query(`
      SELECT category, COUNT(*) as count
      FROM issue_patterns
      GROUP BY category
      ORDER BY count DESC;
    `);

    console.log('\n📋 Patterns by category:');
    categories.forEach(cat => {
      console.log(`  - ${cat.category}: ${cat.count} pattern(s)`);
    });

    // Test the search function
    console.log('\n🔍 Testing search function...');
    const { rows: searchResults } = await client.query(`
      SELECT pattern_id, issue_summary, similarity_score
      FROM search_issue_patterns('database schema', 0.3, 3);
    `);

    if (searchResults.length > 0) {
      console.log('✅ Search function working:');
      searchResults.forEach(result => {
        console.log(`  - ${result.pattern_id}: ${result.issue_summary.substring(0, 60)}... (${Math.round(result.similarity_score * 100)}% match)`);
      });
    }

    console.log('\n✨ Learning history system is ready to use!');
    console.log('\nNext steps:');
    console.log('  1. Test search: node scripts/search-prior-issues.js "your issue"');
    console.log('  2. View patterns: node scripts/view-pattern-dashboard.js');
    console.log('  3. Analyze SD: node lib/learning/pattern-detection-engine.js <SD_UUID>');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n✅ Database connection closed\n');
  }
}

applyMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
