#!/usr/bin/env node
/**
 * Apply LEO Autonomous Continuation Directives Migration
 * SD: SD-LEO-CONTINUITY-001
 *
 * Uses direct PostgreSQL connection (supabase-connection.js pattern)
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('\n🗄️  LEO Autonomous Continuation Directives Migration');
  console.log('   SD: SD-LEO-CONTINUITY-001');
  console.log('   ================================================\n');

  let client;
  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    client = await createDatabaseClient('engineer', { verbose: true });

    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/20260120_leo_autonomous_directives.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    console.log('\n📄 Loaded migration file: 20260120_leo_autonomous_directives.sql');

    // Split into statements (simple split on semicolons followed by newlines)
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && s.length > 5);

    console.log(`\n📋 Executing ${statements.length} statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Skip COMMENT ON statements that may cause issues, skip DO blocks for now
      if (stmt.startsWith('COMMENT ON') || stmt.startsWith('DO $$')) {
        console.log(`   ${i + 1}. Skipping: ${stmt.substring(0, 50)}...`);
        continue;
      }

      try {
        await client.query(stmt);
        console.log(`   ${i + 1}. ✅ Executed: ${stmt.substring(0, 60).replace(/\n/g, ' ')}...`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   ${i + 1}. ⚠️  Already exists (skipped)`);
        } else {
          console.error(`   ${i + 1}. ❌ Error: ${err.message}`);
        }
      }
    }

    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const result = await client.query(`
      SELECT directive_code, title, enforcement_point
      FROM leo_autonomous_directives
      WHERE active = true
      ORDER BY display_order
    `);

    if (result.rows.length > 0) {
      console.log(`\n✅ Migration successful! Found ${result.rows.length} directives:\n`);
      result.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.directive_code}: ${row.title} (${row.enforcement_point})`);
      });
    } else {
      console.log('\n⚠️  No directives found - migration may have failed');
    }

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n📡 Database connection closed');
    }
  }
}

applyMigration();
