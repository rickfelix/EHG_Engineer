#!/usr/bin/env node

/**
 * Apply SD-HARDENING-V2-001A RLS Policies Migration
 *
 * Adds missing anonymous read policies to:
 * - board_members
 * - leo_protocol_sections
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🔧 Applying SD-HARDENING-V2-001A RLS Policies Migration\n');

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'database/migrations/20251218_hardening_v2_001a_rls_policies.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split into statements (basic approach - skip comment lines and verification queries)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        // Skip empty, comments, and SELECT statements
        return s.length > 0 &&
               !s.startsWith('--') &&
               !s.startsWith('/*') &&
               !s.toUpperCase().startsWith('SELECT') &&
               !s.toUpperCase().startsWith('COMMENT ON');
      });

    console.log(`Found ${statements.length} DDL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`[${i + 1}/${statements.length}] Executing...`);

      try {
        await client.query(stmt);
        console.log('   ✅ Success\n');
      } catch (error) {
        // Ignore "does not exist" errors for DROP IF EXISTS
        if (error.message.includes('does not exist') && stmt.toUpperCase().includes('DROP')) {
          console.log('   ⚠️  Policy did not exist (OK)\n');
        } else {
          throw error;
        }
      }
    }

    // Now run verification queries
    console.log('📋 Verification Results:\n');

    console.log('board_members policies:');
    const boardPolicies = await client.query(`
      SELECT policyname, cmd, roles::text
      FROM pg_policies
      WHERE tablename = 'board_members'
      ORDER BY policyname
    `);
    boardPolicies.rows.forEach(p => {
      console.log(`  - ${p.policyname} (${p.cmd}) for ${p.roles}`);
    });

    console.log('\nleo_protocol_sections policies:');
    const leoPolicies = await client.query(`
      SELECT policyname, cmd, roles::text
      FROM pg_policies
      WHERE tablename = 'leo_protocol_sections'
      ORDER BY policyname
    `);
    leoPolicies.rows.forEach(p => {
      console.log(`  - ${p.policyname} (${p.cmd}) for ${p.roles}`);
    });

    console.log('\nstrategic_directives_v2 policies:');
    const sdPolicies = await client.query(`
      SELECT policyname, cmd, roles::text
      FROM pg_policies
      WHERE tablename = 'strategic_directives_v2'
      ORDER BY policyname
    `);
    sdPolicies.rows.forEach(p => {
      console.log(`  - ${p.policyname} (${p.cmd}) for ${p.roles}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
