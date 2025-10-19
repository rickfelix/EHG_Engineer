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
    
    const schema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sub_agent_execution_results'
      ORDER BY ordinal_position
    `);
    
    console.log('sub_agent_execution_results schema:\n');
    schema.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
