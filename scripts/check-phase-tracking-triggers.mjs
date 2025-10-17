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
    
    const triggers = await client.query(`
      SELECT 
        t.tgname as trigger_name,
        pg_get_triggerdef(t.oid) as definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'sd_phase_tracking'
        AND NOT t.tgisinternal
      ORDER BY t.tgname
    `);
    
    console.log(`Triggers on sd_phase_tracking table: ${triggers.rows.length}\n`);
    
    triggers.rows.forEach(row => {
      console.log(`Trigger: ${row.trigger_name}`);
      console.log(row.definition);
      console.log('\n');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
