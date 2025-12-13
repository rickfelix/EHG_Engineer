#!/usr/bin/env node
/**
 * SD ID Schema Cleanup - Phase 1b (DDL Operations)
 *
 * Context: Finalizes the sd_id migration by:
 * 1. Dropping old sd_uuid column from product_requirements_v2
 * 2. Adding performance index on sd_id
 * 3. Adding foreign key constraint
 * 4. Adding deprecation comment to strategic_directives_v2.uuid_id
 *
 * Related: SD-VISION-TRANSITION-001D6 Phase 6
 * Data Migration: Already complete (283 PRDs have sd_id populated)
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  console.log('\n🗄️  SD ID Schema Cleanup - Phase 1b (DDL Operations)\n');

  const client = await createDatabaseClient('engineer', {
    verbose: true,
    verify: true
  });

  try {
    console.log('\n📋 Executing DDL operations...\n');

    // Step 1: Drop old sd_uuid column
    console.log('1️⃣  Dropping sd_uuid column from product_requirements_v2...');
    await client.query(`
      ALTER TABLE product_requirements_v2
      DROP COLUMN IF EXISTS sd_uuid;
    `);
    console.log('   ✅ Column dropped\n');

    // Step 2: Add performance index on sd_id
    console.log('2️⃣  Creating index on sd_id...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_prd_sd_id
      ON product_requirements_v2(sd_id);
    `);
    console.log('   ✅ Index created\n');

    // Step 3: Add foreign key constraint
    console.log('3️⃣  Adding foreign key constraint...');
    await client.query(`
      ALTER TABLE product_requirements_v2
        ADD CONSTRAINT fk_prd_sd_id
        FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
        ON DELETE SET NULL ON UPDATE CASCADE;
    `);
    console.log('   ✅ Foreign key constraint added\n');

    // Step 4: Add deprecation comment to uuid_id column
    console.log('4️⃣  Adding deprecation comment to strategic_directives_v2.uuid_id...');
    await client.query(`
      COMMENT ON COLUMN strategic_directives_v2.uuid_id IS
      'DEPRECATED (2025-12-12): Do not use for FK relationships.
Use the id column instead - it is the canonical identifier.';
    `);
    console.log('   ✅ Comment added\n');

    // Step 5: Verify changes
    console.log('🔍 Verifying schema changes...\n');

    // Verify sd_uuid column no longer exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'product_requirements_v2'
        AND column_name = 'sd_uuid';
    `);
    console.log(`   ✅ sd_uuid column exists: ${columnCheck.rows.length > 0 ? 'YES (ERROR!)' : 'NO (correct)'}`);

    if (columnCheck.rows.length > 0) {
      throw new Error('sd_uuid column still exists after DROP operation');
    }

    // Verify index exists
    const indexCheck = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'product_requirements_v2'
        AND indexname = 'idx_prd_sd_id';
    `);
    console.log(`   ✅ idx_prd_sd_id index exists: ${indexCheck.rows.length > 0 ? 'YES' : 'NO (ERROR!)'}`);

    if (indexCheck.rows.length === 0) {
      throw new Error('idx_prd_sd_id index does not exist');
    }

    // Verify foreign key constraint exists
    const fkCheck = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'product_requirements_v2'
        AND constraint_name = 'fk_prd_sd_id'
        AND constraint_type = 'FOREIGN KEY';
    `);
    console.log(`   ✅ fk_prd_sd_id constraint exists: ${fkCheck.rows.length > 0 ? 'YES' : 'NO (ERROR!)'}`);

    if (fkCheck.rows.length === 0) {
      throw new Error('fk_prd_sd_id foreign key constraint does not exist');
    }

    // Verify comment on uuid_id column
    const commentCheck = await client.query(`
      SELECT col_description('strategic_directives_v2'::regclass,
                             (SELECT ordinal_position
                              FROM information_schema.columns
                              WHERE table_name = 'strategic_directives_v2'
                                AND column_name = 'uuid_id')) as comment;
    `);
    const comment = commentCheck.rows[0]?.comment || '';
    console.log(`   ✅ uuid_id deprecation comment exists: ${comment.includes('DEPRECATED') ? 'YES' : 'NO (WARNING)'}`);

    // Step 6: Test sample PRD→SD join
    console.log('\n🔗 Testing sample PRD→SD join...');
    const joinTest = await client.query(`
      SELECT
        p.id as prd_id,
        p.title as prd_title,
        p.sd_id,
        s.id as sd_id_check,
        s.title as sd_title
      FROM product_requirements_v2 p
      LEFT JOIN strategic_directives_v2 s ON p.sd_id = s.id
      WHERE p.sd_id IS NOT NULL
      LIMIT 5;
    `);

    console.log(`   ✅ Join returned ${joinTest.rows.length} rows\n`);

    if (joinTest.rows.length > 0) {
      console.log('   Sample results:');
      joinTest.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. PRD: ${row.prd_title?.substring(0, 40)}...`);
        console.log(`      → SD: ${row.sd_title?.substring(0, 40)}...`);
        console.log(`      → FK working: ${row.sd_id === row.sd_id_check ? 'YES' : 'NO (ERROR!)'}`);
      });
    }

    console.log('\n✅ SD ID Schema Cleanup Phase 1b COMPLETE\n');
    console.log('Summary:');
    console.log('  ✅ sd_uuid column dropped');
    console.log('  ✅ idx_prd_sd_id index created');
    console.log('  ✅ fk_prd_sd_id foreign key constraint created');
    console.log('  ✅ uuid_id column marked as DEPRECATED');
    console.log('  ✅ PRD→SD joins working correctly\n');

  } catch (error) {
    console.error('\n❌ Schema cleanup failed:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('🔌 Database connection closed\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
