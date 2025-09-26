#!/usr/bin/env node

/**
 * Setup Opportunity Sourcing Tables in Database
 * Creates all necessary tables for SD-1A implementation
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executeSQLFile() {
  try {
    console.log('🚀 Setting up Opportunity Sourcing Tables');
    console.log('=' .repeat(60));

    // Read the SQL migration file
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '2025-09-24-opportunity-sourcing-schema.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');

    console.log('📋 Executing migration: 2025-09-24-opportunity-sourcing-schema.sql');

    // Execute the SQL
    const { error } = await supabase.rpc('execute_sql', {
      sql: sqlContent
    });

    if (error) {
      // If RPC doesn't exist, try alternative method
      if (error.code === 'PGRST202') {
        console.log('⚠️  RPC function not available, please run the SQL manually in Supabase Dashboard');
        console.log('\n📄 SQL File Location:', sqlPath);
        console.log('\nTo execute manually:');
        console.log('1. Go to https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
        console.log('2. Copy and paste the SQL from the file above');
        console.log('3. Click "Run"');
        return;
      }
      throw error;
    }

    console.log('✅ Tables created successfully!');

    // Verify tables were created
    console.log('\n📊 Verifying tables...');

    const tables = ['opportunities', 'opportunity_sources', 'opportunity_categories', 'opportunity_scores'];

    for (const tableName of tables) {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ ${tableName}: Not found or error`);
      } else {
        console.log(`✅ ${tableName}: Ready (${count || 0} records)`);
      }
    }

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Opportunity Sourcing tables are ready!');
    console.log('📍 Next steps:');
    console.log('   1. Navigate to http://localhost:3000/opportunities');
    console.log('   2. Click "New Opportunity" to add your first opportunity');
    console.log('   3. Use the dashboard to track and manage opportunities');

  } catch (error) {
    console.error('❌ Error setting up tables:', error.message);
    process.exit(1);
  }
}

// Run the setup
executeSQLFile();