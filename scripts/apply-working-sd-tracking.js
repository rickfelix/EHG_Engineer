#!/usr/bin/env node

/**
 * Apply Working SD Tracking Migration
 * Adds database support for tracking which SD is currently being worked on
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function applyMigration() {
  console.log('🎯 Applying Working SD Tracking migration...\n');

  // Use pooler connection for DDL operations
  const pool = new Pool({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: {
      rejectUnauthorized: false,
      require: true
    }
  });

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/2025-09-24-working-sd-tracking.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');

    console.log('📝 Executing migration...');
    await pool.query(sql);
    
    console.log('✅ Migration successful!\n');
    console.log('Created:');
    console.log('- Column: is_working_on on strategic_directives_v2');
    console.log('- Table: working_sd_sessions');
    console.log('- Function: set_working_sd(sd_id)');
    console.log('- Function: get_working_sd()');
    console.log('- View: v_current_working_sd');
    console.log('- Trigger: tr_notify_working_sd');
    console.log('\n🚀 Usage:');
    console.log("- SELECT set_working_sd('SD-001') to mark SD as working");
    console.log('- SELECT * FROM get_working_sd() to get current working SD');
    console.log('- SELECT * FROM v_current_working_sd for full context');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Set environment variable and execute
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
applyMigration();