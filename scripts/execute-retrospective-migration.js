#!/usr/bin/env node

/**
 * Execute Retrospective System Database Migration
 * Uses direct PostgreSQL connection via pooler
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function executeMigration() {
  console.log('🚀 Executing Retrospective System Database Migration...\n');

  // Parse the pooler URL
  const poolerUrl = process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found in .env');
    process.exit(1);
  }

  // Create connection pool
  const pool = new Pool({
    connectionString: poolerUrl,
    ssl: {
      rejectUnauthorized: false,
      require: true
    }
  });

  try {
    // Test connection
    const client = await pool.connect();
    const versionResult = await client.query('SELECT version()');
    console.log('✅ Connected to PostgreSQL');
    console.log(`   Version: ${versionResult.rows[0].version.split(',')[0]}\n`);
    client.release();

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-24-retrospective-system.sql');
    const sqlContent = await fs.readFile(migrationPath, 'utf8');

    console.log('📝 Processing migration file...\n');

    // Split into statements - handle different statement types
    const statements = [];
    let currentStatement = '';
    let inFunction = false;

    const lines = sqlContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('--') && !inFunction) {
        continue;
      }

      // Check for function start
      if (trimmed.includes('CREATE OR REPLACE FUNCTION') || trimmed.includes('CREATE FUNCTION')) {
        inFunction = true;
      }

      currentStatement += line + '\n';

      // Check for statement end
      if (inFunction) {
        if (trimmed === '$$ LANGUAGE plpgsql;') {
          statements.push(currentStatement.trim());
          currentStatement = '';
          inFunction = false;
        }
      } else if (trimmed.endsWith(';') && !trimmed.startsWith('--')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (!statement || statement.trim().length === 0) continue;

      // Get operation type
      const preview = statement
        .replace(/\s+/g, ' ')
        .substring(0, 80)
        .replace(/\n/g, ' ');

      process.stdout.write(`[${i + 1}/${statements.length}] ${preview}...`);

      try {
        const execClient = await pool.connect();

        try {
          await execClient.query(statement);
          console.log(' ✅');
          successCount++;
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(' ⏭️ (already exists)');
            skipCount++;
          } else {
            console.log(` ❌\n  Error: ${error.message}`);
            errorCount++;
          }
        } finally {
          execClient.release();
        }
      } catch (error) {
        console.log(` ❌\n  Connection error: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⏭️ Skipped (already exists): ${skipCount}`);
    console.log(`❌ Failed: ${errorCount}`);

    // Verify tables were created
    console.log('\n🔍 Verifying table creation...\n');

    const tablesToCheck = [
      'retrospectives',
      'retrospective_insights',
      'retrospective_templates',
      'retrospective_action_items',
      'retrospective_learning_links',
      'retrospective_triggers'
    ];

    const verifyClient = await pool.connect();

    for (const table of tablesToCheck) {
      try {
        const result = await verifyClient.query(
          `SELECT COUNT(*) FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1`,
          [table]
        );

        if (result.rows[0].count === '1') {
          // Get row count
          const countResult = await verifyClient.query(`SELECT COUNT(*) FROM ${table}`);
          console.log(`  ✅ Table '${table}' exists (${countResult.rows[0].count} rows)`);
        } else {
          console.log(`  ❌ Table '${table}' not found`);
        }
      } catch (error) {
        console.log(`  ❌ Error checking '${table}': ${error.message}`);
      }
    }

    verifyClient.release();

    if (successCount > 0 || skipCount > 0) {
      console.log('\n✨ Migration completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Migrate existing retrospectives: node scripts/migrate-retrospectives-to-db.js');
      console.log('2. Run intelligence integration: node scripts/retrospective-intelligence-integration.js');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Execute
executeMigration();