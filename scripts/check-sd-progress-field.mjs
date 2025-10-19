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
    
    const result = await client.query(`
      SELECT 
        id,
        current_phase,
        status,
        progress_percentage
      FROM strategic_directives_v2
      WHERE id = 'SD-BOARD-GOVERNANCE-001'
    `);
    
    console.log('SD Record:');
    console.log(JSON.stringify(result.rows[0], null, 2));
    console.log('');
    
    // Check for progress trigger
    const triggerCheck = await client.query(`
      SELECT tgname, pg_get_triggerdef(oid) as def
      FROM pg_trigger
      WHERE tgrelid = 'strategic_directives_v2'::regclass
        AND tgname LIKE '%progress%'
    `);
    
    if (triggerCheck.rows.length > 0) {
      console.log('Progress Triggers:');
      triggerCheck.rows.forEach(t => {
        console.log(`\n${t.tgname}:`);
        console.log(t.def);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
