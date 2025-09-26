#!/usr/bin/env node

/**
 * Execute Automatic Reasoning Control Migration
 * Creates tables and functions for automatic chain-of-thought reasoning
 */

import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function executeReasoningMigration() {
  console.log('🧠 EXECUTING AUTOMATIC REASONING CONTROL MIGRATION');
  console.log('='.repeat(55));

  const pool = new Pool({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false, require: true }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Read the migration file
    const migrationPath = join(process.cwd(), 'database/migrations/2025-09-24-automatic-reasoning-control.sql');
    const migrationSQL = await readFile(migrationPath, 'utf-8');

    console.log('\n🔧 Executing migration...');
    await client.query(migrationSQL);

    console.log('✅ Migration executed successfully!');

    // Verify tables were created
    console.log('\n🔍 Verifying table creation...');

    const tables = [
      'leo_reasoning_sessions',
      'leo_complexity_thresholds',
      'leo_reasoning_triggers'
    ];

    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = $1 AND table_schema = 'public'
        )
      `, [table]);

      if (result.rows[0].exists) {
        console.log(`✅ Table '${table}' created successfully`);
      } else {
        console.error(`❌ Table '${table}' was not created`);
      }
    }

    // Verify functions were created
    console.log('\n🔍 Verifying functions...');
    const functions = [
      'calculate_complexity_score',
      'determine_reasoning_depth'
    ];

    for (const func of functions) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.routines
          WHERE routine_name = $1 AND routine_schema = 'public'
        )
      `, [func]);

      if (result.rows[0].exists) {
        console.log(`✅ Function '${func}' created successfully`);
      } else {
        console.error(`❌ Function '${func}' was not created`);
      }
    }

    // Test the complexity calculation function
    console.log('\n🧪 Testing complexity calculation...');

    const testCases = [
      { name: 'Simple task', req_count: 1, priority: 30, description: 'simple ui update' },
      { name: 'Standard task', req_count: 3, priority: 50, description: 'moderate complexity feature' },
      { name: 'Complex task', req_count: 6, priority: 75, description: 'complex integration with api' },
      { name: 'Critical task', req_count: 8, priority: 95, description: 'mission critical security feature with performance requirements' }
    ];

    for (const test of testCases) {
      const result = await client.query(`
        SELECT
          calculate_complexity_score($1, $2, $3, '') as complexity_score,
          determine_reasoning_depth(calculate_complexity_score($1, $2, $3, '')) as reasoning_depth
      `, [test.req_count, test.priority, test.description]);

      console.log(`📊 ${test.name}: Score ${result.rows[0].complexity_score}, Depth: ${result.rows[0].reasoning_depth}`);
    }

    // Check default data insertion
    console.log('\n📋 Verifying default configuration data...');

    const thresholdCount = await client.query('SELECT COUNT(*) FROM leo_complexity_thresholds WHERE active = true');
    console.log(`✅ Complexity thresholds: ${thresholdCount.rows[0].count} configured`);

    const triggerCount = await client.query('SELECT COUNT(*) FROM leo_reasoning_triggers WHERE active = true');
    console.log(`✅ Reasoning triggers: ${triggerCount.rows[0].count} configured`);

    client.release();

    console.log('\n🎉 AUTOMATIC REASONING CONTROL SYSTEM READY!');
    console.log('📝 Features enabled:');
    console.log('   • Automatic complexity detection');
    console.log('   • Chain-of-thought reasoning depth selection');
    console.log('   • Keyword-based trigger system');
    console.log('   • Complexity scoring (0-100)');
    console.log('   • Performance tracking');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  executeReasoningMigration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { executeReasoningMigration };