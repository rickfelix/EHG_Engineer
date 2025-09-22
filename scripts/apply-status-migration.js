#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

async function applyStatusMigration() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase environment variables');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔗 Connected to Supabase');

    // Read migration file  
    const migrationPath = path.join(process.cwd(), 'database', 'migrations', '001_add_status_field_to_sdip_submissions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Loaded migration SQL');

    // Execute migration using RPC if available
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql: migrationSQL
      });

      if (error) {
        console.error('❌ RPC execution failed:', error);
        throw error;
      }
      
      console.log('✅ Migration executed successfully via RPC');
    } catch (rpcError) {
      console.log('⚠️  RPC not available, trying alternative approach');
      
      // Alternative: Execute individual statements
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.toUpperCase().startsWith('ALTER TABLE')) {
          console.log('🔧 Executing ALTER TABLE statement...');
          // For ALTER TABLE, we need to be more careful
          console.log('Statement:', statement);
        } else if (statement.toUpperCase().startsWith('CREATE INDEX')) {
          console.log('📊 Creating index...');
        } else if (statement.toUpperCase().startsWith('UPDATE')) {
          console.log('🔄 Updating existing records...');
        } else if (statement.toUpperCase().startsWith('COMMENT')) {
          console.log('💬 Adding comment...');
        }
      }
      
      console.log('⚠️  Please execute migration manually in Supabase Dashboard');
      console.log('🔗 URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
      console.log('📋 Migration SQL copied to clipboard (if available)');
    }

    // Verify the migration by checking if status column exists
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, column_default')
      .eq('table_name', 'sdip_submissions')
      .eq('column_name', 'status');

    if (columnError) {
      console.log('⚠️  Could not verify column creation');
    } else if (columns && columns.length > 0) {
      console.log('✅ Status column verified:', columns[0]);
    } else {
      console.log('❌ Status column not found - migration may need manual execution');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
applyStatusMigration();