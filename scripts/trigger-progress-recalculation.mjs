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
    console.log('🔄 Triggering Progress Recalculation');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Get current progress before update
    const before = await client.query(`
      SELECT id, progress_percentage, current_phase
      FROM strategic_directives_v2
      WHERE id = 'SD-BOARD-GOVERNANCE-001'
    `);
    console.log('BEFORE UPDATE:');
    console.log(`  Progress: ${before.rows[0].progress_percentage}%`);
    console.log(`  Phase: ${before.rows[0].current_phase}\n`);

    // Trigger progress recalculation with a dummy update
    console.log('Performing dummy update to trigger progress calculation...');
    const update = await client.query(`
      UPDATE strategic_directives_v2
      SET current_phase = current_phase
      WHERE id = 'SD-BOARD-GOVERNANCE-001'
      RETURNING id, progress_percentage, current_phase
    `);

    console.log('\nAFTER UPDATE:');
    console.log(`  Progress: ${update.rows[0].progress_percentage}%`);
    console.log(`  Phase: ${update.rows[0].current_phase}\n`);

    // Also check what get_progress_breakdown says
    const breakdown = await client.query(`
      SELECT get_progress_breakdown('SD-BOARD-GOVERNANCE-001') as result
    `);
    
    console.log('get_progress_breakdown() result:');
    console.log(JSON.stringify(breakdown.rows[0].result, null, 2));

    console.log('\n════════════════════════════════════════════════════════════════');
    if (update.rows[0].progress_percentage === 100) {
      console.log('✅ PROGRESS IS 100%!');
    } else if (update.rows[0].progress_percentage > before.rows[0].progress_percentage) {
      console.log(`⚠️  Progress improved from ${before.rows[0].progress_percentage}% to ${update.rows[0].progress_percentage}%`);
    } else {
      console.log(`⚠️  Progress unchanged at ${update.rows[0].progress_percentage}%`);
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
