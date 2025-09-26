#!/usr/bin/env node

/**
 * Execute Planning Section Migration
 * Adds planning_section to PRD table and automatic reasoning fields
 */

import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function executePlanningMigration() {
  console.log('📋 EXECUTING PLANNING SECTION MIGRATION');
  console.log('='.repeat(45));

  const pool = new Pool({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false, require: true }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Read the migration file
    const migrationPath = join(process.cwd(), 'database/migrations/2025-09-24-add-planning-section-to-prd.sql');
    const migrationSQL = await readFile(migrationPath, 'utf-8');

    console.log('\n🔧 Executing planning section migration...');
    await client.query(migrationSQL);

    console.log('✅ Migration executed successfully!');

    // Verify columns were added
    console.log('\n🔍 Verifying new columns...');

    const columnCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'product_requirements_v2'
      AND column_name IN ('planning_section', 'reasoning_analysis', 'complexity_analysis', 'reasoning_depth', 'confidence_score')
      ORDER BY column_name
    `);

    console.log('📊 New columns added:');
    columnCheck.rows.forEach(col => {
      console.log(`   ✅ ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });

    // Verify trigger was created
    const triggerCheck = await client.query(`
      SELECT trigger_name, event_manipulation, action_timing
      FROM information_schema.triggers
      WHERE trigger_name = 'planning_section_auto_update_trigger'
    `);

    if (triggerCheck.rows.length > 0) {
      console.log('✅ Trigger created: planning_section_auto_update_trigger');
    } else {
      console.error('❌ Trigger was not created');
    }

    // Verify view was created
    const viewCheck = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.views
      WHERE table_name = 'prd_reasoning_analytics'
    `);

    if (viewCheck.rows.length > 0) {
      console.log('✅ Analytics view created: prd_reasoning_analytics');
    } else {
      console.error('❌ Analytics view was not created');
    }

    // Verify function was created
    const functionCheck = await client.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_name = 'get_prds_by_reasoning_depth'
    `);

    if (functionCheck.rows.length > 0) {
      console.log('✅ Function created: get_prds_by_reasoning_depth');
    } else {
      console.error('❌ Function was not created');
    }

    // Test the new structure with sample data
    console.log('\n🧪 Testing planning section structure...');

    // Check if any PRDs exist
    const prdCount = await client.query('SELECT COUNT(*) FROM product_requirements_v2');
    console.log(`📊 Existing PRDs: ${prdCount.rows[0].count}`);

    // Test the reasoning depth function
    try {
      const testFunction = await client.query("SELECT * FROM get_prds_by_reasoning_depth('standard') LIMIT 5");
      console.log(`✅ Function test passed: Found ${testFunction.rows.length} PRDs`);
    } catch (error) {
      console.error('❌ Function test failed:', error.message);
    }

    // Check default planning sections
    const planningCheck = await client.query(`
      SELECT id, title, planning_section->'implementation_steps' as steps
      FROM product_requirements_v2
      WHERE planning_section IS NOT NULL
      LIMIT 3
    `);

    if (planningCheck.rows.length > 0) {
      console.log('✅ Planning sections populated:');
      planningCheck.rows.forEach(row => {
        const stepCount = Array.isArray(row.steps) ? row.steps.length : 'N/A';
        console.log(`   📋 ${row.id}: ${stepCount} implementation steps`);
      });
    }

    client.release();

    console.log('\n🎉 PLANNING SECTION MIGRATION COMPLETE!');
    console.log('📝 New capabilities enabled:');
    console.log('   • Structured planning sections in PRDs');
    console.log('   • Automatic reasoning analysis storage');
    console.log('   • Complexity scoring and confidence tracking');
    console.log('   • Auto-population from reasoning results');
    console.log('   • Analytics views for planning insights');

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
  executePlanningMigration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { executePlanningMigration };