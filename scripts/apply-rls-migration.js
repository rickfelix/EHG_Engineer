#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const { Client } = pg;

dotenv.config();

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected');

    const sql = fs.readFileSync('database/migrations/20251028_allow_anon_read_leo_protocol_sections.sql', 'utf-8');

    console.log('\nApplying migration:\n', sql);

    await client.query(sql);

    console.log('\n✅ Migration applied successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
