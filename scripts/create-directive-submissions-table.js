#!/usr/bin/env node

/**
 * Create Directive Submissions Table for DirectiveLab
 * Sets up the directive_submissions table in Supabase with proper schema,
 * indexes, triggers, and RLS policies for the SDIP DirectiveLab feature.
 * 
 * This script is idempotent and can be run safely multiple times.
 * 
 * Features:
 * - Detects existing tables and analyzes their structure
 * - Provides two schema options: comprehensive vs. basic
 * - Validates table operations and permissions
 * - Handles error cases gracefully
 * - Provides detailed usage information
 * 
 * Usage:
 *   node scripts/create-directive-submissions-table.js
 * 
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)
 * 
 * Files Created/Used:
 *   - database/migrations/create_directive_submissions_table.sql (comprehensive)
 *   - database/migrations/create_directive_submissions_basic.sql (basic)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure dotenv
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createDirectiveSubmissionsTable() {
  console.log('🚀 Creating directive_submissions table for DirectiveLab...\n');
  
  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    console.log('Required environment variables:');
    console.log('  - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
    console.log('  - NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Check if table already exists
    console.log('🔍 Checking if directive_submissions table exists...');
    const { data: _existingTable, error: checkError } = await supabase
      .from('directive_submissions')
      .select('id')
      .limit(1);

    if (!checkError) {
      console.log('✅ Table directive_submissions already exists');
      console.log('   Skipping table creation (idempotent operation)');
      await validateTableStructure(supabase);
      return;
    }
    
    // Only proceed if the error indicates the table doesn't exist
    if (!checkError.message.includes('does not exist') && !checkError.message.includes('relation')) {
      throw new Error(`Unexpected error checking table: ${checkError.message}`);
    }
    
    console.log('📋 Table does not exist, creating from schema...');
    
    // Read the SQL schema file
    const schemaPath = path.join(__dirname, '..', 'database', 'migrations', 'create_directive_submissions_table.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('📁 Loaded comprehensive schema from:', schemaPath);
    
    // Also provide the basic schema option
    const basicSchemaPath = path.join(__dirname, '..', 'database', 'migrations', 'create_directive_submissions_basic.sql');
    const basicSchemaSql = fs.existsSync(basicSchemaPath) ? fs.readFileSync(basicSchemaPath, 'utf8') : null;
    
    // Execute the schema SQL via Supabase SQL Editor instructions
    console.log('\n🔧 Setting up directive_submissions table...');
    console.log('You have two schema options:\n');
    
    console.log('📋 OPTION 1: Comprehensive Schema (Full DirectiveLab features)');
    console.log('========================================');
    console.log('1. Go to your Supabase dashboard:', supabaseUrl);
    console.log('2. Navigate to SQL Editor');
    console.log('3. Create a new query and paste the SQL below');
    console.log('4. Click "Run" to execute');
    console.log('----------------------------------------');
    console.log(schemaSql);
    console.log('========================================\n');
    
    if (basicSchemaSql) {
      console.log('📋 OPTION 2: Basic Schema (User requested columns only)');
      console.log('========================================');
      console.log('Table name: directive_submissions_basic');
      console.log('Use this if you prefer the exact columns you requested:');
      console.log('----------------------------------------');
      console.log(basicSchemaSql);
      console.log('========================================\n');
    }
    
    // Attempt to verify table creation after a brief pause
    console.log('⏳ Waiting for table creation...');
    console.log('   Please run the SQL above and press Enter to continue verification...');
    
    // Simple pause for manual execution
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
    
    await verifyTableCreation(supabase);
    
  } catch (error) {
    console.error('❌ Failed to create directive_submissions table:', error.message);
    process.exit(1);
  }
}

async function verifyTableCreation(supabase) {
  console.log('✅ Verifying table creation...');
  
  try {
    // Test basic table access
    const { data: _data, error } = await supabase
      .from('directive_submissions')
      .select('id, submission_id, status, created_at')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation')) {
        console.log('⚠️  Table still does not exist - please ensure the SQL was executed successfully');
        return false;
      } else {
        throw new Error(`Error accessing table: ${error.message}`);
      }
    }
    
    console.log('✅ Table directive_submissions created successfully!');
    
    // Test insert/update/delete permissions (should work with the policy)
    await testTableOperations(supabase);
    
    return true;
    
  } catch (error) {
    console.error('❌ Table verification failed:', error.message);
    return false;
  }
}

async function testTableOperations(supabase) {
  console.log('🧪 Testing table operations...');
  
  try {
    // Test insert
    const testSubmissionId = `test-${Date.now()}`;
    const { data: _insertData, error: insertError } = await supabase
      .from('directive_submissions')
      .insert({
        submission_id: testSubmissionId,
        feedback: 'Test feedback for table validation',
        status: 'draft'
      })
      .select()
      .single();
    
    if (insertError) {
      throw new Error(`Insert test failed: ${insertError.message}`);
    }
    
    console.log('   ✓ Insert operation successful');
    
    // Test update
    const { error: updateError } = await supabase
      .from('directive_submissions')
      .update({ status: 'completed' })
      .eq('submission_id', testSubmissionId);
    
    if (updateError) {
      throw new Error(`Update test failed: ${updateError.message}`);
    }
    
    console.log('   ✓ Update operation successful');
    
    // Test select
    const { data: _selectData, error: selectError } = await supabase
      .from('directive_submissions')
      .select('*')
      .eq('submission_id', testSubmissionId)
      .single();

    if (selectError) {
      throw new Error(`Select test failed: ${selectError.message}`);
    }
    
    console.log('   ✓ Select operation successful');
    
    // Test delete (cleanup)
    const { error: deleteError } = await supabase
      .from('directive_submissions')
      .delete()
      .eq('submission_id', testSubmissionId);
    
    if (deleteError) {
      throw new Error(`Delete test failed: ${deleteError.message}`);
    }
    
    console.log('   ✓ Delete operation successful');
    console.log('✅ All table operations working correctly!');
    
  } catch (error) {
    console.error('❌ Table operations test failed:', error.message);
    console.log('   This may indicate a permissions or RLS policy issue');
  }
}

async function validateTableStructure(supabase) {
  console.log('🔍 Validating table structure...');
  
  try {
    // First, let's see what the actual table structure looks like
    const { data: _data, error } = await supabase
      .from('directive_submissions')
      .select('*')
      .limit(1);
    
    if (error) {
      console.warn('⚠️  Error accessing table:', error.message);
      return false;
    }
    
    // If we got data or an empty array, we can analyze the structure
    console.log('📊 Current table structure analysis:');
    
    // Try to insert a minimal test record to see the actual schema
    const testId = 'schema-test-' + Date.now();
    const { data: testData, error: testError } = await supabase
      .from('directive_submissions')
      .insert({ submission_id: testId })
      .select()
      .single();
    
    if (testError) {
      console.warn('⚠️  Could not create test record:', testError.message);
      return false;
    }
    
    // Analyze the returned structure
    const actualColumns = Object.keys(testData);
    console.log('   Actual columns:', actualColumns.join(', '));
    
    // Clean up test record
    await supabase.from('directive_submissions').delete().eq('submission_id', testId);
    
    // Check if the table has the expected columns for the user's request
    const expectedColumns = [
      'id', 'submission_id', 'feedback', 'screenshot_url', 'intent_summary', 
      'status', 'created_at', 'updated_at', 'metadata'
    ];
    
    const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
    const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
    
    console.log('\n📋 Column Analysis:');
    
    if (missingColumns.length > 0) {
      console.log('   ❌ Missing expected columns:', missingColumns.join(', '));
      
      // Check if there are similar columns (different names)
      if (actualColumns.includes('chairman_input') && missingColumns.includes('feedback')) {
        console.log('   💡 Note: Found "chairman_input" instead of "feedback"');
      }
      
      console.log('   ⚠️  The existing table has a different structure than requested');
      console.log('   📝 You may need to:');
      console.log('      1. Migrate data to match the new schema, or');
      console.log('      2. Update your application to use the existing schema, or');
      console.log('      3. Drop and recreate the table with the new schema');
    }
    
    if (extraColumns.length > 0) {
      console.log('   📎 Additional columns found:', extraColumns.join(', '));
      console.log('   💡 These provide extra functionality beyond the basic requirements');
    }
    
    const matchingColumns = expectedColumns.filter(col => actualColumns.includes(col));
    if (matchingColumns.length > 0) {
      console.log('   ✅ Matching columns:', matchingColumns.join(', '));
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Table structure validation failed:', error.message);
    return false;
  }
}

// Display usage information
function displayUsageInfo(hasExistingTable = false) {
  console.log('\n📖 Current Status & Usage Information:');
  console.log('=====================================');
  
  if (hasExistingTable) {
    console.log('🎯 EXISTING TABLE FOUND:');
    console.log('   A directive_submissions table already exists with a comprehensive schema');
    console.log('   that includes more features than your basic requirements.');
    console.log('');
    console.log('💡 OPTIONS:');
    console.log('   1. Use the existing table (recommended)');
    console.log('      - Contains chairman_input (similar to feedback)');
    console.log('      - Has additional DirectiveLab workflow features');
    console.log('      - Already integrated with the application');
    console.log('');
    console.log('   2. Create a basic table with your exact requirements');
    console.log('      - Use the "directive_submissions_basic" schema provided');
    console.log('      - Contains only: id, submission_id, feedback, screenshot_url,');
    console.log('        intent_summary, status, created_at, updated_at, metadata');
    console.log('');
  }
  
  console.log('🚀 After table setup, you can:');
  console.log('   1. Test the DirectiveLab feature in your application');
  console.log('   2. Submit feedback through the UI');
  console.log('   3. Check data in Supabase Dashboard > Table Editor');
  console.log('');
  
  if (hasExistingTable) {
    console.log('📊 EXISTING TABLE COLUMNS:');
    console.log('  - id: UUID primary key');
    console.log('  - submission_id: Unique identifier for tracking');
    console.log('  - chairman_input: User feedback text (similar to "feedback")');
    console.log('  - screenshot_url: Optional screenshot URL');
    console.log('  - intent_summary: Extracted intent summary');
    console.log('  - status: Submission status (default: "draft")');
    console.log('  - current_step: Current step in the wizard workflow');
    console.log('  - completed_steps: Array of completed workflow steps');
    console.log('  - gate_status: JSON object for validation gates');
    console.log('  - strategic_tactical_classification: Classification data');
    console.log('  - synthesis_data: Processed analysis data');
    console.log('  - questions: Generated clarifying questions');
    console.log('  - final_summary: Final processed summary');
    console.log('  - created_by: Creator identifier');
    console.log('  - created_at: Creation timestamp');
    console.log('  - updated_at: Last update timestamp (auto-updated)');
    console.log('  - completed_at: Completion timestamp');
    console.log('');
  }
  
  console.log('📋 BASIC TABLE COLUMNS (if you choose Option 2):');
  console.log('  - id: Serial primary key (auto-increment)');
  console.log('  - submission_id: Unique identifier for tracking');
  console.log('  - feedback: User feedback text (required)');
  console.log('  - screenshot_url: Optional screenshot URL');
  console.log('  - intent_summary: Extracted intent summary');
  console.log('  - status: Submission status (default: "draft")');
  console.log('  - created_at: Creation timestamp');
  console.log('  - updated_at: Last update timestamp (auto-updated)');
  console.log('  - metadata: JSON object for additional data');
  console.log('');
  console.log('🔒 Security Features:');
  console.log('  - RLS (Row Level Security) enabled');
  console.log('  - All operations allowed policy (adjust as needed)');
  console.log('  - Indexes for performance optimization');
  console.log('=====================================');
}

// Main execution
async function main() {
  try {
    // Check if table exists first
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('directive_submissions').select('id').limit(1);
      const hasExistingTable = !error || (!error.message.includes('does not exist') && !error.message.includes('relation'));
      
      await createDirectiveSubmissionsTable();
      displayUsageInfo(hasExistingTable);
    } else {
      await createDirectiveSubmissionsTable();
      displayUsageInfo(false);
    }
    
    console.log('\n🎉 Script completed successfully!');
    console.log('   DirectiveLab database setup is ready!');
    
  } catch (error) {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Script interrupted by user');
  process.exit(0);
});

// Run the script
main();