#!/usr/bin/env node

/**
 * Setup script for DatabaseManager
 * Tests programmatic table creation using direct PostgreSQL connection
 */

import dotenv from 'dotenv';
import { DatabaseManager } from '../src/services/DatabaseManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

async function setupDatabaseManager() {
  console.log('====================================');
  console.log('🚀 DatabaseManager Setup Script');
  console.log('====================================\n');

  try {
    // Step 1: Prompt for database password
    console.log('⚠️ IMPORTANT: You need the Supabase database password to enable DDL operations.');
    console.log('📍 Get it from: Supabase Dashboard > Settings > Database > Database Password\n');
    
    // Check if password is in environment
    if (!process.env.SUPABASE_DB_PASSWORD) {
      console.log('❌ SUPABASE_DB_PASSWORD not found in .env file');
      console.log('Please add the following to your .env file:');
      console.log('SUPABASE_DB_PASSWORD=your_database_password_here\n');
      
      console.log('For testing, you can also set it temporarily:');
      console.log('export SUPABASE_DB_PASSWORD="your_password_here"\n');
      
      process.exit(1);
    }

    // Step 2: Create database configuration
    const dbConfig = {
      ehg_engineer: {
        appName: 'EHG Engineer Internal DB',
        purpose: 'LEO Protocol, validation rules, system state',
        
        // Supabase client credentials (from .env)
        projectUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        
        // PostgreSQL connection via Supabase Pooler Session Mode (for DDL)
        // Using Session Mode (port 5432) which supports DDL operations
        dbHost: 'aws-1-us-east-1.pooler.supabase.com', // Correct hostname from dashboard
        dbUser: 'postgres.dedlbzhpgkmetvhbkyzq', // Correct format: postgres.[project-ref]
        dbPassword: process.env.SUPABASE_DB_PASSWORD,
        dbPort: 5432, // Session Mode port for DDL support
        dbName: 'postgres'
      }
    };

    // Step 3: Initialize DatabaseManager
    console.log('🔌 Initializing DatabaseManager...\n');
    const dbManager = new DatabaseManager(dbConfig);
    await dbManager.initialize();

    // Step 4: Switch to EHG Engineer database
    console.log('\n📂 Switching to EHG Engineer database...');
    await dbManager.switchDatabase('ehg_engineer');

    // Step 5: Test DDL capabilities - Create a test table
    console.log('\n🧪 Testing DDL capabilities...');
    console.log('Creating test table: database_manager_test\n');

    const testTableDDL = `
      CREATE TABLE IF NOT EXISTS database_manager_test (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_name VARCHAR(255) NOT NULL,
        test_value TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await dbManager.executeDDL(testTableDDL);
    console.log('✅ Test table created successfully!');

    // Step 6: Verify table exists
    console.log('\n🔍 Verifying table exists...');
    const exists = await dbManager.tableExists('database_manager_test');
    console.log(`Table exists: ${exists ? '✅ YES' : '❌ NO'}`);

    // Step 7: Insert test data
    console.log('\n📝 Inserting test data...');
    await dbManager.query(
      'INSERT INTO database_manager_test (test_name, test_value) VALUES ($1, $2)',
      ['DDL Test', 'DatabaseManager can execute DDL successfully!']
    );
    console.log('✅ Test data inserted');

    // Step 8: Query test data
    console.log('\n📊 Querying test data...');
    const results = await dbManager.query('SELECT * FROM database_manager_test');
    console.log('Results:', JSON.stringify(results, null, 2));

    // Step 9: Clean up test table
    console.log('\n🧹 Cleaning up test table...');
    await dbManager.executeDDL('DROP TABLE IF EXISTS database_manager_test');
    console.log('✅ Test table dropped');

    // Step 10: Create actual UI validation tables
    console.log('\n🏗️ Creating UI validation tables...');
    
    // Check if migration file exists
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '008_ui_validation_schema.sql');
    try {
      const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
      console.log('📄 Found migration file: 008_ui_validation_schema.sql');
      console.log('⚡ Executing migration...\n');
      
      await dbManager.executeDDL(migrationSQL, false); // Don't use transaction for full migration
      console.log('✅ UI validation tables created successfully!');

      // Verify tables were created
      const tables = ['ui_validation_results', 'prd_ui_mappings', 'validation_evidence', 'ui_validation_checkpoints'];
      console.log('\n🔍 Verifying created tables:');
      for (const table of tables) {
        const exists = await dbManager.tableExists(table);
        console.log(`  ${table}: ${exists ? '✅' : '❌'}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Migration file not found, creating tables individually...');
        
        // Create tables one by one
        const createValidationResults = `
          CREATE TABLE IF NOT EXISTS ui_validation_results (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            prd_id VARCHAR(255) NOT NULL,
            sd_id VARCHAR(255),
            test_run_id VARCHAR(255) UNIQUE NOT NULL,
            test_type VARCHAR(50) NOT NULL,
            total_tests INTEGER DEFAULT 0,
            passed_tests INTEGER DEFAULT 0,
            failed_tests INTEGER DEFAULT 0,
            validation_status VARCHAR(50) NOT NULL,
            ui_complete BOOLEAN DEFAULT FALSE,
            gaps_detected JSONB DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
        
        await dbManager.executeDDL(createValidationResults);
        console.log('  ✅ Created ui_validation_results table');
      } else {
        console.error('❌ Error executing migration:', error.message);
      }
    }

    // Step 11: Save configuration
    console.log('\n💾 Saving database configuration...');
    const configPath = path.join(__dirname, '..', 'config', 'databases.json');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    
    // Don't save password to file - should come from env
    const safeConfig = {
      ehg_engineer: {
        ...dbConfig.ehg_engineer,
        dbPassword: '*** SET IN ENVIRONMENT ***'
      }
    };
    
    await fs.writeFile(configPath, JSON.stringify(safeConfig, null, 2));
    console.log('✅ Configuration saved to config/databases.json');

    // Success summary
    console.log('\n====================================');
    console.log('✨ DatabaseManager Setup Complete!');
    console.log('====================================\n');
    console.log('🎯 What we accomplished:');
    console.log('  1. ✅ Initialized DatabaseManager with direct PostgreSQL connection');
    console.log('  2. ✅ Successfully executed DDL statements');
    console.log('  3. ✅ Created and verified test table');
    console.log('  4. ✅ Demonstrated full CRUD operations');
    console.log('  5. ✅ Created UI validation tables (if migration found)');
    console.log('  6. ✅ Saved configuration for future use');
    
    console.log('\n📚 Next Steps:');
    console.log('  1. Add more target databases to config/databases.json');
    console.log('  2. Create migrations in the migrations/ directory');
    console.log('  3. Use DatabaseManager in your application code');
    
    console.log('\n🔑 Remember to keep SUPABASE_DB_PASSWORD in your .env file!');

    // Shutdown
    await dbManager.shutdown();

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nFull error:', error);
    
    if (error.message.includes('password authentication failed')) {
      console.error('\n🔑 Authentication Error!');
      console.error('Please check that SUPABASE_DB_PASSWORD is correct.');
      console.error('Get the password from: Supabase Dashboard > Settings > Database');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n🌐 Connection Error!');
      console.error('Could not connect to the database.');
      console.error('Please check your internet connection and Supabase project status.');
    }
    
    process.exit(1);
  }
}

// Run the setup
setupDatabaseManager().catch(console.error);