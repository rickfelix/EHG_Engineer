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
    console.log('📊 Final Progress Verification: SD-BOARD-GOVERNANCE-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Get progress
    const progressResult = await client.query(`
      SELECT calculate_sd_progress($1) as progress
    `, [sdId]);

    console.log(`🎯 PROGRESS: ${progressResult.rows[0].progress}%\n`);

    // Get detailed breakdown
    const breakdownResult = await client.query(`
      SELECT get_progress_breakdown($1) as breakdown
    `, [sdId]);

    console.log('Detailed Breakdown:');
    console.log(JSON.stringify(breakdownResult.rows[0].breakdown, null, 2));
    console.log('');

    console.log('════════════════════════════════════════════════════════════════');
    if (progressResult.rows[0].progress === 100) {
      console.log('✅ ✅ ✅ PROGRESS IS 100% - SD COMPLETE! ✅ ✅ ✅');
    } else {
      console.log(`⚠️  Progress: ${progressResult.rows[0].progress}% (not yet 100%)`);
    }
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
