/**
 * Run smoke_test_cmd migration against the live database.
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-A
 *
 * Usage: node scripts/run-smoke-test-cmd-migration.cjs
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const connectionString = process.env.SUPABASE_POOLER_URL;
  if (!connectionString) {
    console.error('ERROR: SUPABASE_POOLER_URL not set in .env');
    process.exit(1);
  }

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'database', 'migrations', '20260313_smoke_test_cmd.sql'),
    'utf-8'
  );

  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to database via SUPABASE_POOLER_URL');
    await client.query(sql);
    console.log('Migration applied: smoke_test_cmd column added to product_requirements_v2');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
