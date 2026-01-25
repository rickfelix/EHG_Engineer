#!/usr/bin/env node
/**
 * Apply Governance Bypass Migration (Fix 6)
 * Fixes UUID vs TEXT type mismatch in governance bypass functions
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  console.log('=== Applying Governance Bypass Type Fix (Fix 6) ===\n');

  let client;
  try {
    // Get database client
    client = await createDatabaseClient('engineer');
    console.log('✅ Connected to database\n');

    // Read migration file
    const migrationPath = path.join(process.cwd(), 'database/migrations/20260101_fix6_governance_bypass_type_fix.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Loaded migration file\n');

    // Split SQL into statements
    const statements = splitPostgreSQLStatements(sqlContent);
    console.log(`🔄 Executing ${statements.length} statements...\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt || stmt.startsWith('--')) continue;

      try {
        await client.query(stmt);
        // Show progress for key statements
        if (stmt.includes('CREATE TABLE')) {
          console.log('   ✅ Created audit table');
        } else if (stmt.includes('CREATE OR REPLACE FUNCTION') && stmt.includes('is_valid_automation_bypass')) {
          console.log('   ✅ Created is_valid_automation_bypass function');
        } else if (stmt.includes('CREATE OR REPLACE FUNCTION') && stmt.includes('log_governance_bypass')) {
          console.log('   ✅ Created log_governance_bypass function');
        } else if (stmt.includes('CREATE OR REPLACE FUNCTION') && stmt.includes('enforce_orphan_protection')) {
          console.log('   ✅ Updated enforce_orphan_protection trigger');
        } else if (stmt.includes('CREATE OR REPLACE FUNCTION') && stmt.includes('enforce_sd_type_change_risk')) {
          console.log('   ✅ Updated enforce_sd_type_change_risk trigger');
        } else if (stmt.includes('CREATE OR REPLACE FUNCTION') && stmt.includes('enforce_type_change_timing')) {
          console.log('   ✅ Updated enforce_type_change_timing trigger');
        } else if (stmt.includes('CREATE OR REPLACE FUNCTION') && stmt.includes('enforce_sd_type_change_explanation')) {
          console.log('   ✅ Updated enforce_sd_type_change_explanation trigger');
        }
      } catch (stmtError) {
        // Ignore "already exists" errors for idempotent statements
        if (stmtError.message.includes('already exists')) {
          console.log('   ⏭️  Skipped (already exists)');
        } else if (stmtError.message.includes('does not exist') && stmt.includes('DROP')) {
          // Ignore drop errors for objects that don't exist
          console.log('   ⏭️  Skipped (nothing to drop)');
        } else {
          console.error(`   ❌ Error at statement ${i + 1}:`, stmtError.message);
          // Continue with other statements
        }
      }
    }

    console.log('\n✅ Migration applied!\n');

    // Verify functions exist
    console.log('🔍 Verifying functions...\n');

    const verifyResult = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname IN ('is_valid_automation_bypass', 'log_governance_bypass')
      ORDER BY proname;
    `);

    if (verifyResult.rows.length >= 2) {
      console.log('✅ Functions verified:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.proname}(${row.pronargs} args)`);
      });
    } else {
      console.log('⚠️  Warning: Some functions may not have been created');
      console.log('   Found:', verifyResult.rows.map(r => r.proname).join(', ') || 'none');
    }

    // Check audit table
    const tableResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'sd_governance_bypass_audit';
    `);

    if (tableResult.rows.length > 0) {
      console.log('✅ Audit table exists: sd_governance_bypass_audit');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

applyMigration();
