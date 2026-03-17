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
    
    const sdId = 'SD-BOARD-GOVERNANCE-001';
    
    // Check what's in sd_phase_tracking
    console.log('Current sd_phase_tracking data:');
    const tracking = await client.query(`
      SELECT phase_name, progress, is_complete
      FROM sd_phase_tracking
      WHERE sd_id = $1
      ORDER BY 
        CASE phase_name
          WHEN 'LEAD_APPROVAL' THEN 1
          WHEN 'PLAN_DESIGN' THEN 2
          WHEN 'EXEC_IMPLEMENTATION' THEN 3
          WHEN 'PLAN_VERIFICATION' THEN 4
          WHEN 'LEAD_FINAL_APPROVAL' THEN 5
        END
    `, [sdId]);
    
    tracking.rows.forEach(row => {
      console.log(`   ${row.phase_name}: progress=${row.progress}, complete=${row.is_complete}`);
    });
    
    const sum = tracking.rows.reduce((acc, row) => acc + row.progress, 0);
    console.log(`   Sum: ${sum}`);
    console.log(`   Count: ${tracking.rows.length}`);
    console.log(`   Average: ${sum / tracking.rows.length}\n`);
    
    // Test calculate_sd_progress
    console.log('Testing calculate_sd_progress():');
    const calc = await client.query(`
      SELECT calculate_sd_progress($1) as result
    `, [sdId]);
    console.log(`   Result: ${calc.rows[0].result}%\n`);
    
    // Test get_progress_breakdown
    console.log('Testing get_progress_breakdown():');
    const breakdown = await client.query(`
      SELECT get_progress_breakdown($1) as result
    `, [sdId]);
    console.log(`   total_progress: ${breakdown.rows[0].result.total_progress}`);
    console.log(`   can_complete: ${breakdown.rows[0].result.can_complete}\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
