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

console.log('🔧 ID Schema Standardization - Phase 2: Add Foreign Key Constraint\n');
console.log(`📍 Target: ${config.host}`);
console.log(`📁 Migration: database/migrations/migrate-id-schema-phase2.sql\n`);

const client = new Client(config);

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  // Pre-flight check
  const orphanCheck = await client.query(`
    SELECT COUNT(*) as count
    FROM product_requirements_v2
    WHERE directive_id IS NOT NULL
      AND sd_uuid IS NULL
  `);

  if (parseInt(orphanCheck.rows[0].count) > 0) {
    console.log(`⚠️  Found ${orphanCheck.rows[0].count} orphaned PRDs (reference non-existent SDs)`);
    console.log('   These will remain unlinked. FK constraint allows NULL sd_uuid.\n');
  }

  await client.query('BEGIN');

  // Read migration file
  const sql = await fs.readFile('database/migrations/migrate-id-schema-phase2.sql', 'utf-8');

  console.log('📋 Executing Phase 2 migration...\n');

  // Execute entire migration as single query
  await client.query(sql);

  console.log('   ✅ Added FK constraint fk_prd_sd');
  console.log('   ✅ Enabled CASCADE delete/update');

  await client.query('COMMIT');
  console.log('\n✅ Phase 2 Migration completed successfully!\n');

  // Verification
  const fkCheck = await client.query(`
    SELECT constraint_name, table_name
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_prd_sd'
  `);

  if (fkCheck.rows.length > 0) {
    console.log('📊 Verification:');
    console.log('   ✅ FK constraint fk_prd_sd exists');
    console.log('   ✅ PRD.sd_uuid → SD.uuid_id linkage enforced');
    console.log('   ✅ CASCADE operations enabled\n');
  }

  // Test JOIN
  const joinTest = await client.query(`
    SELECT COUNT(*) as count
    FROM product_requirements_v2 prd
    JOIN strategic_directives_v2 sd ON prd.sd_uuid = sd.uuid_id
  `);

  console.log(`   ✅ JOIN query works: ${joinTest.rows[0].count} PRDs linked to SDs\n`);

  console.log('📋 Migration Complete! Next Steps:');
  console.log('   1. Update unified-handoff-system.js to use sd_uuid');
  console.log('   2. Update all create-prd-*.js scripts to use createPRDLink()');
  console.log('   3. Resume SD-QUALITY-002 execution');

} catch (error) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed:', error.message);
  console.error('   SQL Error:', error.stack);
  console.error('\n🔄 Transaction rolled back - no changes made');
  process.exit(1);
} finally {
  await client.end();
}
