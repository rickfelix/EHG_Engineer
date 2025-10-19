#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.dedlbzhpgkmetvhbkyzq',
  password: process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔧 Updating SD-BOARD-GOVERNANCE-001 Phase to EXEC');
    console.log('   Reason: Implementation done in wrong database');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    const update = await client.query(`
      UPDATE strategic_directives_v2
      SET
        current_phase = 'EXEC_IMPLEMENTATION',
        progress_percentage = 60,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, current_phase, progress_percentage, status
    `, [sdId]);

    console.log('✅ SD Updated:');
    console.log('   Phase:', update.rows[0].current_phase);
    console.log('   Progress:', update.rows[0].progress_percentage + '%');
    console.log('   Status:', update.rows[0].status);
    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ Ready to return to EXEC phase with corrected requirements');
    console.log('════════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
