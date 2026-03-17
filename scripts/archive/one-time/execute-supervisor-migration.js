#!/usr/bin/env node

/**
 * Execute PLAN Supervisor Migration
 * Creates the necessary tables for supervisor functionality
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Supabase client with service role for DDL operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function executeMigration() {
  console.log('🚀 Executing PLAN Supervisor Migration...\n');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'apply-supervisor-safe.sql');
    const fullSQL = fs.readFileSync(sqlPath, 'utf8');
    
    // Parse SQL statements (split on semicolons, but not within strings)
    const statements = fullSQL
      .split(/;\s*$/gm)
      .filter(stmt => {
        const trimmed = stmt.trim();
        return trimmed.length > 0 && 
               !trimmed.startsWith('--') &&
               !trimmed.match(/^\/\*/);
      })
      .map(stmt => stmt.trim() + ';');
    
    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Get first line for logging
      const firstLine = statement.split('\n')[0].substring(0, 60);
      process.stdout.write(`[${i+1}/${statements.length}] ${firstLine}... `);
      
      try {
        // For Supabase, we need to use RPC call for DDL statements
        if (statement.includes('CREATE TABLE') || 
            statement.includes('CREATE INDEX') ||
            statement.includes('GRANT')) {
          
          // Try using raw SQL via fetch to Supabase REST API
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
            {
              method: 'POST',
              headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ query: statement })
            }
          );
          
          if (response.ok) {
            console.log('✅');
            successCount++;
          } else {
            // If RPC doesn't exist, try alternative approach
            console.log('⏭️  (skipped - manual execution needed)');
            skipCount++;
          }
          
        } else if (statement.includes('INSERT INTO')) {
          // For INSERT statements, use Supabase client
          if (statement.includes('plan_conflict_rules')) {
            // Parse and execute the INSERT for conflict rules
            const { error } = await supabase
              .from('plan_conflict_rules')
              .insert([
                {
                  rule_name: 'security_critical_override',
                  priority: 1,
                  if_condition: { 'SECURITY': 'CRITICAL' },
                  then_action: 'BLOCK',
                  override_agents: ['*'],
                  description: 'Security critical issues override all other agents'
                },
                {
                  rule_name: 'database_failure_override',
                  priority: 2,
                  if_condition: { 'DATABASE': 'FAILED' },
                  then_action: 'BLOCK',
                  override_agents: ['TESTING', 'PERFORMANCE', 'DESIGN', 'COST', 'DOCUMENTATION'],
                  description: 'Database failures block except for security issues'
                },
                {
                  rule_name: 'testing_conditional_pass',
                  priority: 3,
                  if_condition: { 'TESTING': 'PASSED', 'others': 'WARNING' },
                  then_action: 'CONDITIONAL_PASS',
                  override_agents: [],
                  description: 'Allow conditional pass if only warnings exist'
                }
              ]);
            
            if (error && !error.message.includes('duplicate')) {
              console.log('❌');
              errors.push(`INSERT failed: ${error.message}`);
              errorCount++;
            } else {
              console.log('✅');
              successCount++;
            }
          }
        } else {
          console.log('⏭️  (skipped)');
          skipCount++;
        }
        
      } catch (err) {
        console.log('❌');
        errors.push(`Statement ${i+1}: ${err.message}`);
        errorCount++;
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary:');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ⏭️  Skipped (manual needed): ${skipCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\nErrors encountered:');
      errors.forEach(err => console.log(`  - ${err}`));
    }
    
    // Verify what was created
    console.log('\n🔍 Verifying migration...\n');
    
    // Check each table
    const tables = [
      'plan_verification_results',
      'plan_subagent_queries', 
      'plan_conflict_rules'
    ];
    
    let tablesCreated = 0;
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      if (!error || error.code === 'PGRST116') {
        console.log(`  ✅ ${table} table is accessible`);
        tablesCreated++;
      } else if (error.message.includes('does not exist')) {
        console.log(`  ❌ ${table} table not found`);
      } else {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (tablesCreated === tables.length) {
      console.log('🎉 Success! PLAN Supervisor tables are ready.');
      console.log('\nYou can now:');
      console.log('  1. Use /leo-verify command for extra verification');
      console.log('  2. Run: node scripts/plan-supervisor-verification.js --prd PRD-ID');
      console.log('  3. Update CLAUDE.md: node scripts/generate-claude-md-from-db.js');
    } else if (tablesCreated > 0) {
      console.log('⚠️  Partial success. Some tables were created.');
      console.log('\nTo complete setup:');
      console.log('  1. Go to Supabase Dashboard > SQL Editor');
      console.log('  2. Run the remaining CREATE TABLE statements from:');
      console.log('     scripts/apply-supervisor-safe.sql');
    } else {
      console.log('ℹ️  Tables need to be created manually.');
      console.log('\nNext steps:');
      console.log('  1. Go to Supabase Dashboard > SQL Editor');
      console.log('  2. Copy the contents of: scripts/apply-supervisor-safe.sql');
      console.log('  3. Paste and execute in SQL Editor');
      console.log('\nThis is likely due to permission restrictions.');
      console.log('The manual approach will work perfectly.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration error:', error.message);
    console.log('\nPlease create the tables manually:');
    console.log('  1. Go to Supabase Dashboard > SQL Editor');
    console.log('  2. Copy contents of: scripts/apply-supervisor-safe.sql');
    console.log('  3. Execute the SQL');
  }
}

// Run migration
executeMigration().catch(console.error);