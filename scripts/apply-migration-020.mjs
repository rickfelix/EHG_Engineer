#!/usr/bin/env node

/**
 * Script to apply migration 020: Enable RLS on context learning tables
 * This is a one-time script to apply the migration to production.
 */

import pg from 'pg';
const { Client } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Get DATABASE_URL from environment or construct from Supabase variables
const DATABASE_URL = process.env.DATABASE_URL ||
  `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

if (!DATABASE_URL || DATABASE_URL.includes('undefined')) {
  console.error('❌ DATABASE_URL not configured properly');
  console.error('   Please set DATABASE_URL in your environment or .env file');
  process.exit(1);
}

async function applyMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '020_enable_rls_context_learning_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔧 Applying migration 020...');
    console.log('   Tables: context_embeddings, feedback_events, interaction_history,');
    console.log('           learning_configurations, user_context_patterns');
    console.log('');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('✅ Migration SQL executed successfully!');
    console.log('');

    // Verify RLS is now enabled on all 5 tables
    console.log('🔍 Verifying RLS status...');
    const tables = [
      'context_embeddings',
      'feedback_events',
      'interaction_history',
      'learning_configurations',
      'user_context_patterns'
    ];

    const { rows } = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
      ORDER BY tablename
    `, [tables]);

    for (const row of rows) {
      const status = row.rowsecurity ? '✅' : '❌';
      console.log(`   ${status} ${row.tablename}: RLS ${row.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
    }

    // Check for any missing tables
    const foundTables = rows.map(r => r.tablename);
    const missingTables = tables.filter(t => !foundTables.includes(t));
    if (missingTables.length > 0) {
      console.log('');
      console.log('⚠️  Warning: Some tables were not found in the database:');
      missingTables.forEach(t => console.log(`   - ${t}`));
    }

    console.log('');
    console.log('✅ Migration 020 complete!');
    console.log('');
    console.log('Next step: Push this change and verify RLS verification workflow passes');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('');
    console.error('Full error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

applyMigration();
