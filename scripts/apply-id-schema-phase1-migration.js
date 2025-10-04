#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs/promises';
import dotenv from 'dotenv';

const { Client } = pg;

// Load environment from EHG_Engineer for database credentials
dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });
dotenv.config();

// EHG_Engineer database
const projectId = 'dedlbzhpgkmetvhbkyzq';
const password = process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1';

// Build connection URL and parse to config
const connectionString = `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;

const url = new URL(connectionString);
const config = {
  host: url.hostname,
  port: url.port || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false }
};

console.log('🔧 ID Schema Standardization - Phase 1: Add UUID Columns\n');
console.log(`📍 Target: ${config.host}`);
console.log(`📁 Migration: database/migrations/migrate-id-schema-phase1.sql\n`);

const client = new Client(config);

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  // Get counts before migration
  const beforeSD = await client.query('SELECT COUNT(*) as count FROM strategic_directives_v2');
  const beforePRD = await client.query('SELECT COUNT(*) as count FROM product_requirements_v2');

  console.log(`📊 Before Migration:`);
  console.log(`   - Strategic Directives: ${beforeSD.rows[0].count}`);
  console.log(`   - Product Requirements: ${beforePRD.rows[0].count}\n`);

  await client.query('BEGIN');

  // Read migration file
  const sql = await fs.readFile('database/migrations/migrate-id-schema-phase1.sql', 'utf-8');

  console.log('📋 Executing Phase 1 migration...\n');

  // Execute entire migration as single query
  await client.query(sql);

  console.log('   ✅ Added uuid_id column to strategic_directives_v2');
  console.log('   ✅ Populated uuid_id for all existing SDs');
  console.log('   ✅ Added sd_uuid column to product_requirements_v2');
  console.log('   ✅ Linked PRDs to SDs via sd_key lookup');
  console.log('   ✅ Created indexes for performance');

  await client.query('COMMIT');
  console.log('\n✅ Phase 1 Migration completed successfully!\n');

  // Verification queries
  const sdWithUuid = await client.query(`
    SELECT COUNT(*) as count
    FROM strategic_directives_v2
    WHERE uuid_id IS NOT NULL
  `);

  const prdWithSdUuid = await client.query(`
    SELECT COUNT(*) as count
    FROM product_requirements_v2
    WHERE sd_uuid IS NOT NULL
  `);

  const orphanedPRDs = await client.query(`
    SELECT COUNT(*) as count
    FROM product_requirements_v2
    WHERE directive_id IS NOT NULL
      AND sd_uuid IS NULL
  `);

  console.log('📊 Verification Results:');
  console.log(`   - SDs with uuid_id: ${sdWithUuid.rows[0].count}/${beforeSD.rows[0].count}`);
  console.log(`   - PRDs with sd_uuid: ${prdWithSdUuid.rows[0].count}/${beforePRD.rows[0].count}`);
  console.log(`   - Orphaned PRDs: ${orphanedPRDs.rows[0].count}`);

  if (orphanedPRDs.rows[0].count > 0) {
    console.log('\n⚠️  WARNING: Some PRDs could not be linked automatically');
    console.log('   Run: node scripts/migrate-id-schema-verify.mjs for details');
  } else {
    console.log('\n✅ All PRDs successfully linked!');
  }

  console.log('\n📋 Next Steps:');
  console.log('   1. Run verification: node scripts/migrate-id-schema-verify.mjs');
  console.log('   2. If all tests pass, run Phase 2: node scripts/apply-id-schema-phase2-migration.js');

} catch (error) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed:', error.message);
  console.error('   SQL Error:', error.stack);
  console.error('\n🔄 Transaction rolled back - no changes made');
  process.exit(1);
} finally {
  await client.end();
}
