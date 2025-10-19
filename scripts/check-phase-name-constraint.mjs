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
    
    const constraint = await client.query(`
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'sd_phase_tracking'::regclass
        AND contype = 'c'  -- Check constraint
        AND conname LIKE '%phase_name%'
    `);
    
    console.log('Phase Name Constraint:');
    console.log(`Name: ${constraint.rows[0].constraint_name}`);
    console.log(`Definition: ${constraint.rows[0].definition}\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
