const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const migrationPath = path.join(__dirname, '..', '..', '.worktrees', 'SD-LEO-FIX-REPLACE-MODEL-SELECTION-001', 'database', 'migrations', '20260213_thinking_effort_routing.sql');

const sql = fs.readFileSync(migrationPath, 'utf8');

const connectionString = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('No SUPABASE_POOLER_URL or DATABASE_URL found');
  process.exit(1);
}

async function run() {
  console.log('Connecting via pooler URL...');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected. Executing migration...');

  // Split by semicolons, filter empty and comment-only lines
  const statements = sql.split(';')
    .map(s => s.trim())
    .filter(s => {
      const lines = s.split('\n').filter(l => !l.trim().startsWith('--') && l.trim().length > 0);
      return lines.length > 0;
    });

  for (const stmt of statements) {
    const preview = stmt.replace(/\n/g, ' ').substring(0, 100);
    console.log('\nExecuting:', preview + '...');
    try {
      const result = await client.query(stmt);
      console.log('  Result:', result.command, result.rowCount !== null ? result.rowCount + ' rows' : '');
    } catch (err) {
      console.error('  ERROR:', err.message);
    }
  }

  console.log('\n--- Verification Query ---');
  const verify = await client.query('SELECT code, model_tier, thinking_effort FROM leo_sub_agents WHERE active = true ORDER BY code');
  console.log('\nActive Sub-Agents After Migration:');
  console.table(verify.rows);

  await client.end();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
