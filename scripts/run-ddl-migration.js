#!/usr/bin/env node

/**
 * Execute DDL migration using direct pg connection with pooler
 * Based on DATABASE_CONNECTION_GUIDE.md
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runDDLMigration() {
  // Configuration for Supabase pooler connection (Session Mode for DDL)
  const poolConfig = {
    host: 'aws-1-us-east-1.pooler.supabase.com',  // aws-1 not aws-0
    port: 5432, // Session mode (required for DDL)
    user: 'postgres.dedlbzhpgkmetvhbkyzq',
    password: process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  };

  if (!poolConfig.password) {
    console.error('❌ Missing database password. Please set SUPABASE_DB_PASSWORD or DATABASE_PASSWORD in .env');
    console.log('\nTo get your database password:');
    console.log('1. Go to https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/settings/database');
    console.log('2. Find the Database Password section');
    console.log('3. Add to .env: SUPABASE_DB_PASSWORD=your_password');
    process.exit(1);
  }

  const pool = new Pool(poolConfig);

  try {
    console.log('🚀 Connecting to Supabase via pooler connection...');

    // Test connection
    const testResult = await pool.query('SELECT version()');
    console.log('✅ Connected successfully');
    console.log('   PostgreSQL:', testResult.rows[0].version.split(',')[0]);

    // Check if column already exists
    const checkSQL = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'strategic_directives_v2'
      AND column_name = 'target_application';
    `;

    const checkResult = await pool.query(checkSQL);

    if (checkResult.rows.length > 0) {
      console.log('\n✅ Column target_application already exists!');

      // Get current counts
      const countSQL = `
        SELECT
          COUNT(*) FILTER (WHERE target_application = 'EHG') as ehg_count,
          COUNT(*) FILTER (WHERE target_application = 'EHG_ENGINEER') as eng_count,
          COUNT(*) FILTER (WHERE target_application IS NULL) as null_count,
          COUNT(*) as total
        FROM strategic_directives_v2;
      `;

      const countResult = await pool.query(countSQL);

      console.log('\n📊 Current classification:');
      console.log('   EHG SDs:', countResult.rows[0].ehg_count);
      console.log('   EHG_ENGINEER SDs:', countResult.rows[0].eng_count);
      console.log('   Unclassified:', countResult.rows[0].null_count);
      console.log('   Total:', countResult.rows[0].total);

      console.log('\n💡 To apply classifications, run:');
      console.log('   node scripts/apply-sd-classification.js');

    } else {
      console.log('\n📝 Adding target_application column...');

      // Read migration SQL
      const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-23-add-target-application.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      // Split SQL into statements (simple split, assumes no semicolons in strings)
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`   Found ${statements.length} SQL statements to execute`);

      // Execute each statement
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];

        // Skip DO blocks and complex statements for now
        if (stmt.includes('DO $$') || stmt.includes('BEGIN')) {
          console.log(`   ⏭️  Skipping complex statement ${i + 1}`);
          continue;
        }

        try {
          console.log(`   Executing statement ${i + 1}...`);
          await pool.query(stmt);
          console.log(`   ✅ Statement ${i + 1} executed`);
        } catch (err) {
          if (err.message.includes('already exists')) {
            console.log(`   ⚠️  Statement ${i + 1}: Already exists, skipping`);
          } else {
            console.log(`   ❌ Statement ${i + 1} failed:`, err.message);
          }
        }
      }

      // Verify the column was added
      const verifyResult = await pool.query(checkSQL);

      if (verifyResult.rows.length > 0) {
        console.log('\n✅ Migration complete! Column added successfully');

        // Get final counts
        const finalCountSQL = `
          SELECT
            COUNT(*) FILTER (WHERE target_application = 'EHG') as ehg_count,
            COUNT(*) FILTER (WHERE target_application = 'EHG_ENGINEER') as eng_count,
            COUNT(*) as total
          FROM strategic_directives_v2;
        `;

        const finalCounts = await pool.query(finalCountSQL);

        console.log('\n📊 Classification results:');
        console.log('   EHG SDs:', finalCounts.rows[0].ehg_count);
        console.log('   EHG_ENGINEER SDs:', finalCounts.rows[0].eng_count);
        console.log('   Total:', finalCounts.rows[0].total);

        console.log('\n🎉 Next steps:');
        console.log('1. Run: node scripts/apply-sd-classification.js (if needed)');
        console.log('2. Restart the server to see UI changes');
      } else {
        console.log('⚠️ Column not found after migration, something may have gone wrong');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    await pool.end();
    console.log('\n👋 Connection closed');
  }
}

// Run the migration
runDDLMigration();