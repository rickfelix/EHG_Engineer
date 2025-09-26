#!/usr/bin/env node

/**
 * Execute Documentation Monitor Database Migration
 * Creates all tables for the DOCMON sub-agent
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function executeMigration() {
  console.log('🚀 Applying Documentation Monitor database schema...\n');

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
    const migrationPath = path.join(__dirname, '../database/migrations/2025-09-24-documentation-monitor.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');

    console.log('📝 Executing migration...');
    const result = await pool.query(sql);
    
    console.log('✅ Migration successful!');
    console.log('\nCreated tables:');
    console.log('- documentation_inventory');
    console.log('- folder_structure_snapshot');
    console.log('- documentation_violations');
    console.log('- documentation_health_checks');
    console.log('- leo_protocol_file_audit');
    console.log('- documentation_templates');
    console.log('\nCreated views:');
    console.log('- v_active_documentation_violations');
    console.log('- v_agent_documentation_compliance');
    console.log('- v_documentation_health_summary');
    console.log('\nCreated triggers:');
    console.log('- tr_detect_violations');
    console.log('- tr_doc_inventory_updated');
    console.log('- tr_violations_updated');

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
executeMigration();