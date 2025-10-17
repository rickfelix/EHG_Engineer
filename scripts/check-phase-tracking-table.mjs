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
    
    console.log('Checking sd_phase_tracking table...\n');
    
    const result = await client.query(`
      SELECT * FROM sd_phase_tracking
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      ORDER BY created_at
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No rows found in sd_phase_tracking for SD-BOARD-GOVERNANCE-001');
      console.log('\nThis is why calculate_sd_progress() returns 0%!');
      console.log('The function uses: SUM(progress) / COUNT(*) from sd_phase_tracking\n');
    } else {
      console.log(`✅ Found ${result.rows.length} phase tracking records:\n`);
      result.rows.forEach(row => {
        console.log(`   - ${row.phase_name}: ${row.progress}% (complete: ${row.is_complete})`);
      });
      
      const sum = result.rows.reduce((acc, row) => acc + row.progress, 0);
      console.log(`\n   Total: ${sum}%`);
      console.log(`   Average: ${Math.floor(sum / result.rows.length)}%`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
