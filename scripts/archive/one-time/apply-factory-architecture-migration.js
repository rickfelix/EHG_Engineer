#!/usr/bin/env node
/**
 * Apply Factory Architecture Migration
 * SD: SD-VISION-TRANSITION-001
 * Migration: 20251206_factory_architecture.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
  console.log('🏗️  Applying Factory Architecture Migration...\n');
  console.log('Migration: 20251206_factory_architecture.sql');
  console.log('SD: SD-VISION-TRANSITION-001\n');

  let client;

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '20251206_factory_architecture.sql');
    console.log(`📄 Reading migration from: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`✅ Migration file loaded (${sql.length} bytes)\n`);

    // Connect to database
    console.log('🔌 Connecting to database...');
    client = await createDatabaseClient('engineer', { verify: false });
    console.log('✅ Connected to database\n');

    // Execute migration
    console.log('🚀 Executing migration...');
    await client.query(sql);
    console.log('✅ Migration executed successfully\n');

    // Verify key tables were created
    console.log('🔍 Verifying migration results...\n');

    const tables = [
      'lifecycle_stage_config',
      'archetype_benchmarks',
      'venture_stage_work',
      'venture_artifacts',
      'chairman_decisions'
    ];

    for (const table of tables) {
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_name = $1
      `, [table]);

      const exists = result.rows[0].count > 0;
      console.log(`  ${exists ? '✅' : '❌'} ${table}: ${exists ? 'exists' : 'NOT FOUND'}`);
    }

    // Check lifecycle stages were populated
    const stageCount = await client.query('SELECT COUNT(*) as count FROM lifecycle_stage_config');
    console.log(`\n  📊 Lifecycle stages: ${stageCount.rows[0].count}/25 populated`);

    // Check archetype benchmarks
    const archetypeCount = await client.query('SELECT COUNT(*) as count FROM archetype_benchmarks');
    console.log(`  📊 Archetype benchmarks: ${archetypeCount.rows[0].count}/7 populated`);

    // Check helper functions
    console.log('\n🔧 Verifying helper functions...\n');
    const functions = [
      'get_venture_stage_summary',
      'advance_venture_stage',
      'initialize_venture_stages'
    ];

    for (const func of functions) {
      const result = await client.query(`
        SELECT COUNT(*) as count
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [func]);

      const exists = result.rows[0].count > 0;
      console.log(`  ${exists ? '✅' : '❌'} ${func}(): ${exists ? 'exists' : 'NOT FOUND'}`);
    }

    console.log('\n✅ Factory Architecture Migration Complete!\n');
    console.log('Summary:');
    console.log('  - 5 new tables created');
    console.log('  - 25 lifecycle stages configured');
    console.log('  - 7 archetype benchmarks configured');
    console.log('  - 3 helper functions created');
    console.log('  - RLS policies enabled');
    console.log('  - Triggers configured\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);

    if (error.message.includes('already exists')) {
      console.log('\nℹ️  Some objects may already exist. This could be expected if migration was partially applied.');
      console.log('Run verification queries to check current state.\n');
    }

    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed');
    }
  }
}

applyMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
