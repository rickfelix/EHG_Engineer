#!/usr/bin/env node
/**
 * Apply Board Infrastructure Migration
 * EXEC Phase: Day 1 Critical Action
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyMigration() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    console.log('\n🔧 Applying Board Infrastructure Migration');
    console.log('═'.repeat(70));

    // Read migration file
    const migrationPath = join(process.cwd(), 'database/migrations/20251011_board_infrastructure_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    // Split into statements using proper parser
    const statements = splitPostgreSQLStatements(migrationSQL);

    console.log(`   Total statements: ${statements.length}`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comment-only statements
      if (statement.startsWith('--')) {
        continue;
      }

      try {
        await client.query(statement);

        // Log meaningful operations
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`   ✅ Created table: ${tableName}`);
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (\w+)/i)?.[1];
          console.log(`   ✅ Created index: ${indexName}`);
        } else if (statement.includes('CREATE POLICY')) {
          const policyName = statement.match(/CREATE POLICY "([^"]+)"/i)?.[1];
          console.log(`   ✅ Created policy: ${policyName}`);
        } else if (statement.includes('INSERT INTO')) {
          console.log(`   ✅ Inserted seed data`);
        } else if (statement.includes('ALTER TABLE') && statement.includes('ENABLE ROW LEVEL SECURITY')) {
          const tableName = statement.match(/ALTER TABLE (\w+)/i)?.[1];
          console.log(`   ✅ Enabled RLS on: ${tableName}`);
        } else if (statement.includes('COMMENT ON TABLE')) {
          // Skip logging comments
        } else {
          console.log(`   ✅ Statement ${i + 1}/${statements.length}`);
        }

        successCount++;
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes('already exists') || err.message.includes('duplicate key')) {
          skipCount++;
          if (statement.includes('CREATE TABLE')) {
            const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
            console.log(`   ⏭️  Table already exists: ${tableName}`);
          } else if (statement.includes('INSERT INTO')) {
            console.log(`   ⏭️  Seed data already exists (skipped)`);
          }
        } else {
          console.error(`   ❌ Error: ${err.message.substring(0, 100)}`);
          errorCount++;
        }
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    // Verify tables exist
    console.log('\n🔍 Verifying Tables:');

    const tables = ['board_members', 'board_meetings', 'board_meeting_attendance'];
    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        );
      `, [table]);

      const exists = result.rows[0].exists;
      console.log(`   ${table}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    }

    // Verify seed data
    const memberCount = await client.query(`SELECT COUNT(*) as count FROM board_members;`);
    console.log(`\n👥 Board Members: ${memberCount.rows[0].count}`);

    if (memberCount.rows[0].count >= 7) {
      console.log('   ✅ All 7 board members seeded');
      console.log('\n✅ BLOCKER RESOLVED: Board infrastructure ready!');
    } else {
      console.log(`   ⚠️  Only ${memberCount.rows[0].count} members (expected 7)`);
    }

  } finally {
    await client.end();
  }
}

applyMigration().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
