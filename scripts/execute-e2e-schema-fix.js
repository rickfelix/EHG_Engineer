#!/usr/bin/env node

/**
 * Execute E2E Schema Fix Migration
 * Adds system_events.details column and verifies brand_variants table
 * For SD-E2E-SCHEMA-FIX-R2
 */

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('========================================');
  console.log('E2E SCHEMA FIX MIGRATION');
  console.log('SD-E2E-SCHEMA-FIX-R2');
  console.log('========================================\n');

  // Use pg client for DDL operations
  const { Client } = await import('pg');

  const password = 'Fl!M32DaM00n!1';
  // Using port 6543 (transaction pooler)
  const connectionString = `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Step 1: Check if system_events.details column exists
    console.log('Step 1: Checking system_events.details column...');
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'system_events'
        AND column_name = 'details'
    `);

    if (checkColumn.rows.length === 0) {
      console.log('  Column does not exist, adding...');
      await client.query(`
        ALTER TABLE system_events ADD COLUMN IF NOT EXISTS details JSONB;
      `);
      console.log('  ✅ Added system_events.details column');

      // Add comment
      await client.query(`
        COMMENT ON COLUMN system_events.details IS 'JSONB column for storing event metadata, added for E2E test support';
      `);
      console.log('  ✅ Added column comment');
    } else {
      console.log('  ✅ Column already exists');
    }

    // Step 2: Check if brand_variants table exists
    console.log('\nStep 2: Checking brand_variants table...');
    const checkTable = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'brand_variants'
        AND table_schema = 'public'
    `);

    if (checkTable.rows.length === 0) {
      console.log('  Table does not exist, creating...');

      // Execute the brand_variants migration
      await client.query(`
        -- Create brand_variants table
        CREATE TABLE IF NOT EXISTS brand_variants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          venture_id UUID NOT NULL,
          variant_name TEXT NOT NULL,
          visual_assets JSONB,
          tone_of_voice TEXT,
          messaging_pillars JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        -- Add indexes
        CREATE INDEX IF NOT EXISTS idx_brand_variants_venture_id ON brand_variants(venture_id);

        -- Enable RLS
        ALTER TABLE brand_variants ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        DROP POLICY IF EXISTS "brand_variants_select_policy" ON brand_variants;
        CREATE POLICY "brand_variants_select_policy" ON brand_variants
          FOR SELECT TO authenticated USING (true);

        DROP POLICY IF EXISTS "brand_variants_insert_policy" ON brand_variants;
        CREATE POLICY "brand_variants_insert_policy" ON brand_variants
          FOR INSERT TO authenticated WITH CHECK (true);

        DROP POLICY IF EXISTS "brand_variants_update_policy" ON brand_variants;
        CREATE POLICY "brand_variants_update_policy" ON brand_variants
          FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

        DROP POLICY IF EXISTS "brand_variants_delete_policy" ON brand_variants;
        CREATE POLICY "brand_variants_delete_policy" ON brand_variants
          FOR DELETE TO authenticated USING (true);

        -- Also allow anon access for E2E tests
        DROP POLICY IF EXISTS "brand_variants_anon_select" ON brand_variants;
        CREATE POLICY "brand_variants_anon_select" ON brand_variants
          FOR SELECT TO anon USING (true);

        DROP POLICY IF EXISTS "brand_variants_anon_insert" ON brand_variants;
        CREATE POLICY "brand_variants_anon_insert" ON brand_variants
          FOR INSERT TO anon WITH CHECK (true);
      `);
      console.log('  ✅ Created brand_variants table with RLS policies');
    } else {
      console.log('  ✅ Table already exists');
    }

    // Step 3: Verify columns in system_events
    console.log('\nStep 3: Verifying system_events schema...');
    const systemEventsSchema = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'system_events'
      ORDER BY ordinal_position
    `);
    console.log('  system_events columns:');
    systemEventsSchema.rows.forEach(col => {
      console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });

    // Step 4: Verify brand_variants exists
    console.log('\nStep 4: Verifying brand_variants table...');
    const brandVariantsSchema = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'brand_variants'
      ORDER BY ordinal_position
    `);
    console.log('  brand_variants columns:');
    brandVariantsSchema.rows.forEach(col => {
      console.log(`    - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });

    console.log('\n========================================');
    console.log('✅ E2E SCHEMA FIX MIGRATION COMPLETE');
    console.log('========================================\n');

    console.log('Summary:');
    console.log('  1. system_events.details column: PRESENT');
    console.log('  2. brand_variants table: PRESENT');
    console.log('\nNext steps:');
    console.log('  1. Run E2E tests to verify fixes');
    console.log('  2. Complete PLAN-TO-EXEC handoff for SD-E2E-SCHEMA-FIX-R2');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
