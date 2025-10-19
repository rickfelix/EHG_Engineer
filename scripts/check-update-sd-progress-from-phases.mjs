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
    
    const funcDef = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'update_sd_progress_from_phases'
        AND n.nspname = 'public'
    `);
    
    console.log('=== update_sd_progress_from_phases() function ===\n');
    console.log(funcDef.rows[0].definition);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
