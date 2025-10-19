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
    
    console.log('Sample data from sd_phase_tracking:\n');
    const sample = await client.query(`
      SELECT sd_id, phase_name, progress, is_complete
      FROM sd_phase_tracking
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    if (sample.rows.length === 0) {
      console.log('❌ No data found in sd_phase_tracking table\n');
      console.log('This table appears to be unused or new.\n');
      console.log('The progress system may rely entirely on get_progress_breakdown()');
      console.log('which calculates progress from other tables, not sd_phase_tracking.\n');
    } else {
      console.log(`Found ${sample.rows.length} rows:\n`);
      
      // Group by SD
      const bySd = {};
      sample.rows.forEach(row => {
        if (!bySd[row.sd_id]) bySd[row.sd_id] = [];
        bySd[row.sd_id].push(row);
      });
      
      for (const [sdId, phases] of Object.entries(bySd)) {
        console.log(`SD: ${sdId}`);
        phases.forEach(p => {
          console.log(`   ${p.phase_name}: ${p.progress}% (complete: ${p.is_complete})`);
        });
        const sum = phases.reduce((acc, p) => acc + p.progress, 0);
        const avg = sum / phases.length;
        console.log(`   Sum: ${sum}, Average: ${avg}\n`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
