#!/usr/bin/env node
/**
 * Execute BMAD Enhancement Migrations
 *
 * Runs:
 * 1. 009_bmad_risk_assessment.sql - Creates tables and columns
 * 2. 009b_add_risk_subagent.sql - Adds RISK sub-agent to database
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Execute a single migration file
 */
async function executeMigration(client, migrationPath, migrationName) {
  console.log(`\n📄 Executing migration: ${migrationName}`);
  console.log('─'.repeat(60));

  try {
    // Read migration file
    const sql = readFileSync(migrationPath, 'utf-8');
    console.log(`   ✓ Read migration file (${sql.length} chars)`);

    // Execute migration
    console.log('   ⚙️  Executing SQL...');
    await client.query(sql);

    console.log(`   ✅ ${migrationName} executed successfully`);
    return { success: true, migration: migrationName };

  } catch (error) {
    console.error(`   ❌ ${migrationName} failed: ${error.message}`);

    // Show detailed error for debugging
    if (error.position) {
      console.error(`      Error at position: ${error.position}`);
    }
    if (error.line) {
      console.error(`      Error at line: ${error.line}`);
    }

    return { success: false, migration: migrationName, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🔧 BMAD ENHANCEMENT MIGRATIONS');
  console.log('═'.repeat(60));
  console.log('Target: EHG_Engineer database');
  console.log('Migrations: 009_bmad_risk_assessment.sql, 009b_add_risk_subagent.sql\n');

  let client;

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });

    // Execute migrations
    const migrations = [
      {
        path: join(__dirname, '../database/migrations/009_bmad_risk_assessment.sql'),
        name: '009_bmad_risk_assessment.sql'
      },
      {
        path: join(__dirname, '../database/migrations/009b_add_risk_subagent.sql'),
        name: '009b_add_risk_subagent.sql'
      }
    ];

    const results = [];

    for (const migration of migrations) {
      const result = await executeMigration(client, migration.path, migration.name);
      results.push(result);

      // Stop if migration fails
      if (!result.success) {
        console.log('\n⚠️  Migration failed, stopping execution');
        break;
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('═'.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Total migrations: ${results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);

    if (failed === 0) {
      console.log('\n✅ All migrations completed successfully!\n');
      console.log('Next steps:');
      console.log('1. Test RISK sub-agent: node lib/sub-agents/risk.js SD-XXX');
      console.log('2. Test orchestration: node scripts/orchestrate-phase-subagents.js LEAD_PRE_APPROVAL SD-XXX');
      console.log('3. Update CLAUDE.md via database: Add BMAD section to leo_protocol_sections');
    } else {
      console.log('\n⚠️  Some migrations failed. Review errors above.\n');
    }

    console.log('═'.repeat(60));

    // Close connection
    await client.end();

    // Exit with appropriate code
    process.exit(failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);

    if (client) {
      await client.end();
    }

    process.exit(1);
  }
}

// Execute
main();
