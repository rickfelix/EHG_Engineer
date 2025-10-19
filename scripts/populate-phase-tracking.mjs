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
    console.log('📊 Populating sd_phase_tracking for SD-BOARD-VISUAL-BUILDER-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-VISUAL-BUILDER-001';

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sd_phase_tracking'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ sd_phase_tracking table does not exist!');
      console.log('Cannot proceed without this table.\n');
      process.exit(1);
    }

    console.log('✅ sd_phase_tracking table exists\n');

    // Define all completed phases (use weighted progress values)
    // Total should be 100: 20+20+30+15+15=100
    const phases = [
      { phase: 'LEAD_APPROVAL', progress: 20, complete: true },        // Weight: 20
      { phase: 'PLAN_DESIGN', progress: 20, complete: true },          // Weight: 20 (PLAN_prd)
      { phase: 'EXEC_IMPLEMENTATION', progress: 30, complete: true },  // Weight: 30
      { phase: 'PLAN_VERIFICATION', progress: 15, complete: true },    // Weight: 15
      { phase: 'LEAD_FINAL_APPROVAL', progress: 15, complete: true }   // Weight: 15
    ];

    console.log('Step 1: Inserting phase tracking records (incomplete)...\n');
    for (const phase of phases) {
      const result = await client.query(`
        INSERT INTO sd_phase_tracking (
          sd_id, phase_name, progress, is_complete
        ) VALUES ($1, $2, $3, $4)
        RETURNING id, phase_name, progress, is_complete
      `, [sdId, phase.phase, phase.progress, false]);  // Insert as incomplete first

      console.log(`   ✅ ${result.rows[0].phase_name}: ${result.rows[0].progress}% (complete: ${result.rows[0].is_complete})`);
    }

    console.log(`\n✅ Created ${phases.length} phase tracking records\n`);

    // Step 2: Mark all phases as complete in one update
    console.log('Step 2: Marking all phases as complete...\n');
    const updateResult = await client.query(`
      UPDATE sd_phase_tracking
      SET is_complete = true
      WHERE sd_id = $1
      RETURNING phase_name, is_complete
    `, [sdId]);

    updateResult.rows.forEach(row => {
      console.log(`   ✅ ${row.phase_name}: complete = ${row.is_complete}`);
    });

    console.log(`\n✅ Updated ${updateResult.rows.length} phases to complete\n`);

    // Verify sum
    const sumCheck = await client.query(`
      SELECT 
        COUNT(*) as count,
        SUM(progress) as total_progress,
        (SUM(progress) / COUNT(*))::INTEGER as average_progress
      FROM sd_phase_tracking
      WHERE sd_id = $1
    `, [sdId]);

    const { count, total_progress, average_progress } = sumCheck.rows[0];
    console.log('Verification:');
    console.log(`   Phases: ${count}`);
    console.log(`   Total Progress: ${total_progress}`);
    console.log(`   Average Progress: ${average_progress}%\n`);

    // Test calculate_sd_progress function
    const calcResult = await client.query(`
      SELECT calculate_sd_progress($1) as progress
    `, [sdId]);

    console.log(`📊 calculate_sd_progress() now returns: ${calcResult.rows[0].progress}%\n`);

    console.log('════════════════════════════════════════════════════════════════');
    if (calcResult.rows[0].progress === 100) {
      console.log('✅ ✅ ✅ PROGRESS IS 100%! ✅ ✅ ✅');
    } else {
      console.log(`⚠️  Progress: ${calcResult.rows[0].progress}% (expected 100%)`);
    }
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
