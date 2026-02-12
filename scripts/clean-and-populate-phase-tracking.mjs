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
    console.log('📊 Clean & Populate sd_phase_tracking');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Step 1: Delete existing records
    console.log('Step 1: Cleaning existing records...');
    const deleteResult = await client.query(`
      DELETE FROM sd_phase_tracking
      WHERE sd_id = $1
      RETURNING phase_name
    `, [sdId]);
    
    if (deleteResult.rows.length > 0) {
      console.log(`   ✅ Deleted ${deleteResult.rows.length} existing records\n`);
    } else {
      console.log(`   ℹ️  No existing records to delete\n`);
    }

    // Step 2: Define weighted phases
    const phases = [
      { phase: 'LEAD_APPROVAL', progress: 20 },
      { phase: 'PLAN_DESIGN', progress: 20 },
      { phase: 'EXEC_IMPLEMENTATION', progress: 30 },
      { phase: 'PLAN_VERIFICATION', progress: 15 },
      { phase: 'LEAD_FINAL_APPROVAL', progress: 15 }
    ];

    console.log('Step 2: Inserting phases (incomplete)...\n');
    for (const phase of phases) {
      const result = await client.query(`
        INSERT INTO sd_phase_tracking (
          sd_id, phase_name, progress, is_complete
        ) VALUES ($1, $2, $3, $4)
        RETURNING phase_name, progress, is_complete
      `, [sdId, phase.phase, phase.progress, false]);
      
      console.log(`   ✅ ${result.rows[0].phase_name}: ${result.rows[0].progress}%`);
    }

    console.log('\nStep 3: Marking all phases as complete...\n');
    const updateResult = await client.query(`
      UPDATE sd_phase_tracking
      SET is_complete = true
      WHERE sd_id = $1
      RETURNING phase_name
    `, [sdId]);

    console.log(`   ✅ Marked ${updateResult.rows.length} phases as complete\n`);

    // Step 4: Verify progress
    const progressResult = await client.query(`
      SELECT calculate_sd_progress($1) as progress
    `, [sdId]);

    console.log('════════════════════════════════════════════════════════════════');
    console.log(`📊 FINAL PROGRESS: ${progressResult.rows[0].progress}%`);
    console.log('════════════════════════════════════════════════════════════════\n');

    if (progressResult.rows[0].progress === 100) {
      console.log('✅ ✅ ✅ SUCCESS! PROGRESS IS 100%! ✅ ✅ ✅\n');
    } else {
      console.log(`⚠️  Warning: Progress is ${progressResult.rows[0].progress}% (expected 100%)\n`);
    }

    // Check SD status
    const sdStatus = await client.query(`
      SELECT id, status, progress_percentage, current_phase
      FROM strategic_directives_v2
      WHERE id = $1
    `, [sdId]);

    console.log('SD Status:');
    console.log(`   Status: ${sdStatus.rows[0].status}`);
    console.log(`   Progress: ${sdStatus.rows[0].progress_percentage}%`);
    console.log(`   Phase: ${sdStatus.rows[0].current_phase}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
