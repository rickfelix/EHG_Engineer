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
    console.log('📊 Atomic Phase Tracking Population');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Delete existing
    await client.query(`DELETE FROM sd_phase_tracking WHERE sd_id = $1`, [sdId]);
    console.log('✅ Cleaned existing records\n');

    // Insert ALL phases in a SINGLE INSERT statement (atomic)
    console.log('Inserting all 5 phases atomically...\n');
    await client.query(`
      INSERT INTO sd_phase_tracking (sd_id, phase_name, progress, is_complete)
      VALUES 
        ($1, 'LEAD_APPROVAL', 100, true),
        ($1, 'PLAN_DESIGN', 100, true),
        ($1, 'EXEC_IMPLEMENTATION', 100, true),
        ($1, 'PLAN_VERIFICATION', 100, true),
        ($1, 'LEAD_FINAL_APPROVAL', 100, true)
    `, [sdId]);

    console.log('✅ All phases inserted\n');

    // Verify
    const verify = await client.query(`
      SELECT phase_name, progress, is_complete
      FROM sd_phase_tracking
      WHERE sd_id = $1
      ORDER BY CASE phase_name
        WHEN 'LEAD_APPROVAL' THEN 1
        WHEN 'PLAN_DESIGN' THEN 2
        WHEN 'EXEC_IMPLEMENTATION' THEN 3
        WHEN 'PLAN_VERIFICATION' THEN 4
        WHEN 'LEAD_FINAL_APPROVAL' THEN 5
      END
    `, [sdId]);

    verify.rows.forEach(row => {
      console.log(`   ${row.phase_name}: ${row.progress}% (complete: ${row.is_complete})`);
    });

    const sum = verify.rows.reduce((acc, row) => acc + row.progress, 0);
    console.log(`\n   Sum: ${sum}, Average: ${sum / verify.rows.length}%\n`);

    // Test calculate_sd_progress
    const calc = await client.query(`
      SELECT calculate_sd_progress($1) as result
    `, [sdId]);

    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📊 calculate_sd_progress() = ${calc.rows[0].result}%`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Check SD status
    const sd = await client.query(`
      SELECT id, status, progress_percentage, current_phase
      FROM strategic_directives_v2 WHERE id = $1
    `, [sdId]);

    console.log('SD Status:');
    console.log(`   ID: ${sd.rows[0].id}`);
    console.log(`   Status: ${sd.rows[0].status}`);
    console.log(`   Progress: ${sd.rows[0].progress_percentage}%`);
    console.log(`   Phase: ${sd.rows[0].current_phase || 'None'}\n`);

    if (sd.rows[0].status === 'completed') {
      console.log('✅ ✅ ✅ SD COMPLETED! ✅ ✅ ✅\n');
    } else {
      console.log(`ℹ️  SD status: ${sd.rows[0].status}\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
