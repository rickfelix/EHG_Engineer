#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs/promises';
import dotenv from 'dotenv';

const { Client } = pg;

// Load environment from EHG_Engineer for database credentials
dotenv.config({ path: './.env' });
dotenv.config();

// EHG_Engineer database
const projectId = 'dedlbzhpgkmetvhbkyzq';
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error('SUPABASE_DB_PASSWORD required');

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

console.log('🔧 Adding NOT NULL constraint to sd_key field\n');
console.log(`📍 Target: ${config.host}`);
console.log('📁 Migration: database/migrations/add-sd-key-not-null-constraint.sql\n');

const client = new Client(config);

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  await client.query('BEGIN');

  // Read migration file
  const sql = await fs.readFile('database/migrations/add-sd-key-not-null-constraint.sql', 'utf-8');

  console.log('📋 Executing migration SQL...\n');

  // Execute entire migration as single query
  await client.query(sql);

  console.log('   ✅ Updated NULL sd_key values to use id field');
  console.log('   ✅ Added NOT NULL constraint to sd_key column');
  console.log('   ✅ Created unique index on sd_key');

  await client.query('COMMIT');
  console.log('\n✅ Migration completed successfully!');

  console.log('\n📊 Result:');
  console.log('   - sd_key column now requires non-null values');
  console.log('   - Any existing NULL values updated to match id field');
  console.log('   - Unique constraint enforced on sd_key');

  // Verify by checking for any NULL sd_keys
  const { rows } = await client.query(`
    SELECT COUNT(*) as null_count
    FROM strategic_directives_v2
    WHERE sd_key IS NULL
  `);

  console.log(`\n🔍 Verification: ${rows[0].null_count} rows with NULL sd_key (should be 0)`);

} catch (error) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed:', error.message);
  console.error('   SQL Error:', error.stack);
  process.exit(1);
} finally {
  await client.end();
}
