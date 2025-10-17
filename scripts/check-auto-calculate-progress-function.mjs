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
    
    console.log('=== auto_calculate_progress() function ===\n');
    const funcDef = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'auto_calculate_progress'
        AND n.nspname = 'public'
    `);
    
    console.log(funcDef.rows[0].definition);
    console.log('\n');
    
    // Also check get_progress_breakdown to see where it calculates 80 vs 100
    console.log('=== get_progress_breakdown() source (checking total calculation) ===\n');
    const breakdownDef = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'get_progress_breakdown'
        AND n.nspname = 'public'
    `);
    
    // Print only relevant parts
    const source = breakdownDef.rows[0].definition;
    console.log(source.substring(source.indexOf('total_progress'), source.indexOf('total_progress') + 500));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
