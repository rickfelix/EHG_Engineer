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
    
    // Check if handoff is trying to insert with status='accepted'
    console.log('Checking trigger logic...\n');
    
    const triggerDef = await client.query(`
      SELECT pg_get_triggerdef(t.oid) as definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'sd_phase_handoffs'
        AND t.tgname = 'validate_handoff_trigger'
    `);
    
    console.log('Trigger Definition:');
    console.log(triggerDef.rows[0].definition);
    console.log('\n');
    
    // Get the auto_validate_handoff function
    const funcDef = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'auto_validate_handoff'
        AND n.nspname = 'public'
    `);
    
    console.log('Function Definition:');
    console.log(funcDef.rows[0].definition);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
