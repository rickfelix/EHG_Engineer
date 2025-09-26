#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyCustomShortcutsMigration() {
  console.log('🔨 Applying custom shortcuts migration...\n');

  // Parse DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Missing DATABASE_URL');
    process.exit(1);
  }

  // Create PostgreSQL client
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/2025-09-23-custom-shortcuts.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await client.query(sqlContent);
    console.log('✅ Custom shortcuts migration applied successfully!');

    // Verify tables exist
    const tableCheckQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('user_shortcut_preferences', 'navigation_shortcuts')
      ORDER BY table_name;
    `;

    const result = await client.query(tableCheckQuery);
    console.log('\n📊 Migration tables:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Test database functions
    const functionCheckQuery = `
      SELECT proname
      FROM pg_proc
      WHERE proname IN ('get_user_shortcuts', 'save_user_shortcut', 'reset_user_shortcuts');
    `;

    const funcResult = await client.query(functionCheckQuery);
    console.log('\n🔧 Created functions:');
    funcResult.rows.forEach(row => {
      console.log(`   ✓ ${row.proname}()`);
    });

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

async function main() {
  await applyCustomShortcutsMigration();
}

main().catch(console.error);