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

console.log('🔧 Creating test_coverage_policies table');
console.log('📋 SD: SD-QUALITY-002');
console.log('📋 PRD: PRD-99e35b97-e370-459f-96e2-373176210254\n');
console.log(`📍 Target: ${config.host}\n`);

const client = new Client(config);

try {
  await client.connect();
  console.log('✅ Connected to database\n');

  await client.query('BEGIN');

  // Read migration file
  const sql = await fs.readFile('database/migrations/create-test-coverage-policies.sql', 'utf-8');

  console.log('📋 Executing migration...\n');

  // Execute entire migration as single query
  await client.query(sql);

  console.log('   ✅ Created test_coverage_policies table');
  console.log('   ✅ Populated 3 policy tiers');
  console.log('   ✅ Created LOC range index');

  await client.query('COMMIT');
  console.log('\n✅ Migration completed successfully!\n');

  // Verification
  const { rows: policies } = await client.query(`
    SELECT tier_name, loc_min, loc_max, requirement_level
    FROM test_coverage_policies
    ORDER BY loc_min
  `);

  console.log('📊 Policy Tiers:');
  policies.forEach(p => {
    console.log(`   ${p.tier_name}`);
    console.log(`      LOC Range: ${p.loc_min}-${p.loc_max}`);
    console.log(`      Requirement: ${p.requirement_level}\n`);
  });

  // Test LOC lookup
  const testLOC = 35;
  const { rows: match } = await client.query(`
    SELECT tier_name, requirement_level
    FROM test_coverage_policies
    WHERE $1 BETWEEN loc_min AND loc_max
  `, [testLOC]);

  console.log(`🔍 Test Lookup: ${testLOC} LOC file`);
  console.log(`   Result: ${match[0].tier_name} - ${match[0].requirement_level}\n`);

  console.log('📋 Next Steps:');
  console.log('   1. Update QA sub-agent to query this table');
  console.log('   2. Update CLAUDE.md with policy reference');
  console.log('   3. Test with files of varying LOC');

} catch (error) {
  await client.query('ROLLBACK');
  console.error('\n❌ Migration failed:', error.message);
  console.error('   SQL Error:', error.stack);
  console.error('\n🔄 Transaction rolled back - no changes made');
  process.exit(1);
} finally {
  await client.end();
}
