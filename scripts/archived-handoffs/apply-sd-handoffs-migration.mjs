#!/usr/bin/env node

/**
 * Apply sd_phase_handoffs table migration
 * Consolidates all handoff tables into ONE unified table
 */

import pg from 'pg';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const projectId = 'dedlbzhpgkmetvhbkyzq'; // EHG_Engineer database
const password = process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1';

// Pooler connection (correct region: aws-1 for dedlbzhpgkmetvhbkyzq)
const config = {
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: `postgres.${projectId}`,
  password: password,
  ssl: { rejectUnauthorized: false }
};

async function applyMigration() {
  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const sql = await fs.readFile('database/migrations/create-sd-phase-handoffs-table.sql', 'utf-8');

    // Remove comment lines first, then split by semicolon
    const sqlWithoutComments = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = sqlWithoutComments
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`\n📝 Executing ${statements.length} SQL statements (no transaction for idempotency)...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      try {
        await client.query(statement);
        console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
      } catch (err) {
        // Ignore expected errors for idempotent operations
        if (err.message.includes('does not exist') ||
            err.message.includes('already exists') ||
            err.message.includes('duplicate')) {
          console.log(`   ℹ️  Skipping statement ${i + 1} (${err.message.split('\n')[0]})`);
        } else {
          console.error(`❌ Error on statement ${i + 1}:`, err.message);
          console.error(`   Statement: ${statement.substring(0, 100)}...`);
          throw err;
        }
      }
    }
    console.log('\n✅ Migration applied successfully!');
    console.log('\n📊 Table created: sd_phase_handoffs');
    console.log('   Purpose: Unified handoff tracking');
    console.log('   Features: 7 mandatory elements, database-first');
    console.log('   Replaces: sd_handoffs, handoff_tracking, handoffs');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
