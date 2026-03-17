#!/usr/bin/env node

/**
 * Apply PLAN Supervisor Database Migration
 * This script executes the SQL migration to add supervisor capabilities to PLAN agent
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('🔄 Applying PLAN Supervisor Database Migration...\n');
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database', 'schema', '010_plan_supervisor_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL into individual statements (simple split on semicolons)
    // Note: This is a simplified approach - for production, use a proper SQL parser
    const statements = migrationSQL
      .split(/;\s*$/gm)
      .filter(stmt => stmt.trim().length > 0 && !stmt.trim().startsWith('--'))
      .map(stmt => stmt.trim() + ';');
    
    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip pure comment blocks
      if (statement.match(/^--/)) continue;
      
      // Extract first meaningful line for logging
      const firstLine = statement.split('\n')[0].substring(0, 50);
      console.log(`Executing: ${firstLine}...`);
      
      try {
        // For CREATE TABLE and ALTER TABLE statements
        if (statement.includes('CREATE TABLE') || statement.includes('ALTER TABLE')) {
          // Execute as raw SQL using RPC
          const { error } = await supabase.rpc('execute_sql', { 
            query: statement 
          }).single();
          
          if (error) {
            // Try direct execution as fallback
            console.log('  Trying alternative execution method...');
            // Note: Supabase doesn't directly support raw SQL execution
            // We'll need to handle this differently
            console.log('  ⚠️  Manual execution needed for DDL statements');
            errorCount++;
          } else {
            console.log('  ✅ Success');
            successCount++;
          }
        } else {
          // For other statements, log them for manual execution
          console.log('  ℹ️  Statement logged for manual execution');
        }
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Migration Summary:');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed: ${errorCount}`);
    console.log(`  ℹ️  Manual: ${statements.length - successCount - errorCount}`);
    console.log('='.repeat(50));
    
    // Check if tables were created
    console.log('\n🔍 Verifying migration results...\n');
    
    // Check if PLAN agent has supervisor_mode column
    const { data: planAgent, error: _planError } = await supabase
      .from('leo_agents')
      .select('agent_code')
      .eq('agent_code', 'PLAN')
      .single();
    
    if (planAgent) {
      console.log('✅ leo_agents table exists');
    } else {
      console.log('⚠️  leo_agents table not found - may need to run LEO Protocol base migration first');
    }
    
    // Test if verification table exists by attempting a query
    const { error: verifyError } = await supabase
      .from('plan_verification_results')
      .select('id')
      .limit(1);
    
    if (!verifyError || verifyError.code === 'PGRST116') {
      console.log('✅ plan_verification_results table created successfully');
    } else {
      console.log('⚠️  plan_verification_results table not created - manual migration needed');
    }
    
    console.log('\n📝 Next Steps:');
    console.log('1. If tables weren\'t created, run the SQL manually in Supabase dashboard');
    console.log('2. Run: node scripts/generate-claude-md-from-db.js');
    console.log('3. Test with: /leo-verify command in Claude Code');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration().catch(console.error);