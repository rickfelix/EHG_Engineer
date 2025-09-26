#!/usr/bin/env node

/**
 * Execute DDL migration using DatabaseManager with pooler connection
 * Based on DATABASE_CONNECTION_GUIDE.md
 */

const DatabaseManager = require('../src/services/DatabaseManager');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function executeDDLMigration() {
  const dbManager = new DatabaseManager();

  try {
    console.log('🚀 Connecting to Supabase using pooler connection...\n');

    // Setup connection using pooler in session mode (port 5432 for DDL)
    const config = {
      dbHost: 'aws-0-us-east-1.pooler.supabase.com', // Pooler host
      dbPort: 5432, // Session mode for DDL operations
      dbUser: `postgres.dedlbzhpgkmetvhbkyzq`, // postgres.[PROJECT-REF]
      dbPassword: process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD,
      dbName: 'postgres',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    };

    if (!config.dbPassword) {
      console.error('❌ Missing database password. Please set SUPABASE_DB_PASSWORD or DATABASE_PASSWORD in .env');
      console.log('\nTo get your database password:');
      console.log('1. Go to https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/settings/database');
      console.log('2. Find the Database Password section');
      console.log('3. Add to .env: SUPABASE_DB_PASSWORD=your_password');
      process.exit(1);
    }

    // Add connection
    const connectionResult = await dbManager.addConnection('main', config);
    console.log('✅ Connected to database:', connectionResult.success);
    console.log('   Version:', connectionResult.version);

    // Read the migration SQL
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-23-add-target-application.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📝 Executing migration: 2025-09-23-add-target-application.sql');

    // Execute the migration
    const result = await dbManager.executeDDL(migrationSQL, false); // Don't use transaction for ALTER TABLE

    console.log('✅ Migration executed successfully!');

    // Verify the column was added
    const verifySQL = `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'strategic_directives_v2'
      AND column_name = 'target_application';
    `;

    const verifyResult = await dbManager.query(verifySQL);

    if (verifyResult.rows && verifyResult.rows.length > 0) {
      console.log('\n✅ Column verified:');
      console.log('   Column:', verifyResult.rows[0].column_name);
      console.log('   Type:', verifyResult.rows[0].data_type);
      console.log('   Default:', verifyResult.rows[0].column_default);

      // Get counts
      const countSQL = `
        SELECT
          COUNT(*) FILTER (WHERE target_application = 'EHG') as ehg_count,
          COUNT(*) FILTER (WHERE target_application = 'EHG_ENGINEER') as eng_count,
          COUNT(*) as total
        FROM strategic_directives_v2;
      `;

      const countResult = await dbManager.query(countSQL);

      console.log('\n📊 Classification results:');
      console.log('   EHG SDs:', countResult.rows[0].ehg_count);
      console.log('   EHG_ENGINEER SDs:', countResult.rows[0].eng_count);
      console.log('   Total:', countResult.rows[0].total);

      console.log('\n🎉 Migration complete! You can now:');
      console.log('1. Run: node scripts/apply-sd-classification.js');
      console.log('2. Restart the server to see the UI changes');
    } else {
      console.log('⚠️ Column not found, migration may have failed');
    }

    // Close connections
    await dbManager.closeAll();

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);

    // If column already exists, that's OK
    if (error.message && error.message.includes('already exists')) {
      console.log('\n✅ Column already exists, skipping creation');
      console.log('You can run: node scripts/apply-sd-classification.js');
    }

    process.exit(1);
  }
}

// Run the migration
executeDDLMigration();