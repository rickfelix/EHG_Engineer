#!/usr/bin/env node

/**
 * Execute Cross-Agent Intelligence System Database Migration
 * Creates tables for agent learning and intelligence patterns
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function executeMigration() {
  console.log('🧠 Executing Cross-Agent Intelligence Database Migration...\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found in .env');
    process.exit(1);
  }

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
    console.log('✅ Connected to PostgreSQL\n');
    client.release();

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-24-cross-agent-intelligence.sql');
    const sqlContent = await fs.readFile(migrationPath, 'utf8');

    console.log('📝 Processing cross-agent intelligence migration...\n');

    // Split into statements
    const statements = [];
    let currentStatement = '';
    let inFunction = false;

    const lines = sqlContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('--') && !inFunction) {
        continue;
      }

      if (trimmed.includes('CREATE OR REPLACE FUNCTION') || trimmed.includes('CREATE FUNCTION')) {
        inFunction = true;
      }

      currentStatement += line + '\n';

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
          } else if (error.message.includes('does not exist') && statement.includes('DROP')) {
            console.log(' ⏭️ (nothing to drop)');
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
    console.log(`⏭️ Skipped: ${skipCount}`);
    console.log(`❌ Failed: ${errorCount}`);

    // Verify tables were created
    console.log('\n🔍 Verifying table creation...\n');

    const tablesToCheck = [
      'agent_learning_outcomes',
      'intelligence_patterns',
      'agent_intelligence_insights',
      'cross_agent_correlations',
      'agent_learning_history',
      'pattern_recommendations'
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
      console.log('\n✨ Cross-Agent Intelligence system ready!');
      console.log('\nNext steps:');
      console.log('1. Run intelligence integration: node scripts/retrospective-intelligence-integration.js');
      console.log('2. Test pattern generation: node scripts/test-cross-agent-intelligence.js');
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