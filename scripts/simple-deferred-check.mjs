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
  password: process.env.SUPABASE_DB_PASSWORD // SECURITY: env var required,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    
    const sdId = 'SD-BOARD-GOVERNANCE-001';

    // Get deliverables
    const deliverables = await client.query(`
      SELECT deliverable_name, completion_status, description
      FROM sd_scope_deliverables
      WHERE sd_id = $1
      ORDER BY created_at
    `, [sdId]);

    console.log('Deliverables Status:\n');
    deliverables.rows.forEach(d => {
      const icon = d.completion_status === 'completed' ? '✅' : 
                   d.completion_status === 'deferred' ? '⏸️' : '❌';
      console.log(`${icon} ${d.deliverable_name}: ${d.completion_status}`);
      if (d.completion_status === 'deferred') {
        console.log(`   Reason: ${d.description}`);
      }
    });

    const deferredCount = deliverables.rows.filter(d => d.completion_status === 'deferred').length;
    console.log(`\nDeferred items: ${deferredCount}\n`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
