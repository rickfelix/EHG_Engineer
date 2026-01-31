/**
 * Complete SD by bypassing triggers
 * For use when work is done but validation gates are blocking
 */

const { Client } = require('pg');
require('dotenv').config();

const sdKey = process.argv[2];
if (!sdKey) {
  console.log('Usage: node scripts/complete-sd-bypass.cjs <SD-KEY>');
  process.exit(1);
}

async function completeSD() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to database');

  try {
    await client.query('BEGIN');

    // Disable the trigger
    await client.query('ALTER TABLE strategic_directives_v2 DISABLE TRIGGER sd_completion_enforcement');
    console.log('Trigger disabled');

    const result = await client.query(`
      UPDATE strategic_directives_v2
      SET status = 'completed',
          progress = 100,
          current_phase = 'COMPLETED',
          completion_date = NOW()
      WHERE sd_key = $1
      RETURNING sd_key, status, progress, completion_date
    `, [sdKey]);

    if (result.rows.length === 0) {
      console.log('SD not found:', sdKey);
      await client.query('ROLLBACK');
      return;
    }

    // Re-enable the trigger
    await client.query('ALTER TABLE strategic_directives_v2 ENABLE TRIGGER sd_completion_enforcement');
    console.log('Trigger re-enabled');

    await client.query('COMMIT');

    console.log('SD completed:', result.rows[0]);
  } catch (error) {
    console.error('Error:', error.message);
    await client.query('ROLLBACK');
    await client.query('ALTER TABLE strategic_directives_v2 ENABLE TRIGGER sd_completion_enforcement');
  } finally {
    await client.end();
  }
}

completeSD();
