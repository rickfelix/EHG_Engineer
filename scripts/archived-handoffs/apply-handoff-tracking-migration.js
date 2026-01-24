#!/usr/bin/env node

/**
 * Apply Handoff Tracking Tables Migration
 * Creates leo_handoff_validations and leo_handoff_rejections tables
 */

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectId = 'dedlbzhpgkmetvhbkyzq'; // EHG_Engineer database
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error('SUPABASE_DB_PASSWORD required');

async function applyMigration() {
  // Use Pool with individual parameters (IPv4 compatible, matches DatabaseManager pattern)
  const pool = new Pool({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectId}`,
    password: password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Get a client from the pool
  const client = await pool.connect();

  try {
    console.log('🔗 Connected to database\n');

    console.log('📋 Reading migration file...\n');
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', 'create-handoff-tracking-tables.sql');
    const sql = await fs.readFile(migrationPath, 'utf-8');

    console.log('🚀 Applying migration...\n');
    await client.query('BEGIN');

    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => {
        // Remove SQL comments (lines starting with --)
        return s.split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      })
      .filter(s => s.length > 0); // Keep only non-empty statements

    for (const statement of statements) {
      await client.query(statement + ';');
      const preview = statement.replace(/\s+/g, ' ').substring(0, 60);
      console.log(`  ✅ Executed: ${preview}...`);
    }

    await client.query('COMMIT');

    console.log('\n🎉 Migration completed successfully!\n');

    // Verify tables exist
    console.log('🔍 Verifying table creation...\n');
    const tables = ['leo_handoff_validations', 'leo_handoff_rejections'];

    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [table]);

      if (result.rows[0].exists) {
        console.log(`  ✅ ${table}: EXISTS`);
      } else {
        console.log(`  ❌ ${table}: MISSING`);
      }
    }

    console.log('\n✅ Handoff tracking infrastructure complete!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release(); // Release client back to pool
    await pool.end(); // Close the pool
  }
}

applyMigration();
