const fs = require('fs');
require('dotenv').config();
const { Client } = require('pg');

const migrationPath = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FIX-FIX-SESSION-LIVENESS-001/database/migrations/session_liveness_is_alive_and_switch_claim.sql';
const sql = fs.readFileSync(migrationPath, 'utf-8');

const poolerUrl = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;

async function run() {
  const client = new Client({ connectionString: poolerUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to database via pooler URL');

  try {
    await client.query(sql);
    console.log('Migration executed successfully');

    // Verify: check is_alive column exists
    const colCheck = await client.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'claude_sessions' AND column_name = 'is_alive'"
    );
    console.log('\nVerification - is_alive column:', JSON.stringify(colCheck.rows, null, 2));

    // Verify: v_live_sessions view exists
    const viewCheck = await client.query(
      "SELECT table_name FROM information_schema.views WHERE table_name = 'v_live_sessions'"
    );
    console.log('Verification - v_live_sessions view:', viewCheck.rows.length > 0 ? 'EXISTS' : 'MISSING');

    // Verify: switch_sd_claim function exists
    const funcCheck = await client.query(
      "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'switch_sd_claim'"
    );
    console.log('Verification - switch_sd_claim function:', funcCheck.rows.length > 0 ? 'EXISTS' : 'MISSING');

  } catch (err) {
    console.error('Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
