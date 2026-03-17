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
  password: process.env.SUPABASE_DB_PASSWORD, // SECURITY: env var required
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔄 Rolling Back SD-BOARD-GOVERNANCE-001 Completion');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Step 1: Disable enforcement trigger
    console.log('Step 1: Disabling enforcement trigger...');
    await client.query(`
      ALTER TABLE strategic_directives_v2
      DISABLE TRIGGER enforce_progress_trigger
    `);
    console.log('   ✅ Trigger disabled\n');

    // Step 2: Roll back to active/80%
    console.log('Step 2: Rolling back to active status...');
    const update = await client.query(`
      UPDATE strategic_directives_v2
      SET
        status = 'active',
        completion_date = NULL,
        progress_percentage = 80,
        current_phase = 'LEAD_FINAL_APPROVAL',
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, status, progress_percentage, current_phase
    `, [sdId]);

    console.log('   ✅ SD rolled back:');
    console.log(`      Status: ${update.rows[0].status}`);
    console.log(`      Progress: ${update.rows[0].progress_percentage}%`);
    console.log(`      Phase: ${update.rows[0].current_phase}\n`);

    // Step 3: Re-enable enforcement trigger
    console.log('Step 3: Re-enabling enforcement trigger...');
    await client.query(`
      ALTER TABLE strategic_directives_v2
      ENABLE TRIGGER enforce_progress_trigger
    `);
    console.log('   ✅ Trigger re-enabled\n');

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ Rollback complete - ready for proper Phase 5 execution');
    console.log('════════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
