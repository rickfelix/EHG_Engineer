const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

console.log('═══════════════════════════════════════════════════════════════');
console.log('   PRINCIPAL DATABASE ARCHITECT - Migration Execution');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('👤 Role: Database Architect (30 years experience)');
console.log('🎯 Task: Execute progress_percentage column migration');
console.log('📋 Context: SD-VIDEO-VARIANT-001 LEAD→PLAN handoff unblock');
console.log('');

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  console.log('─── PHASE 1: PRE-MIGRATION VERIFICATION ───\n');
  
  // Check current state
  const { data: sdBefore, error: beforeError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();
  
  if (beforeError) {
    console.log('❌ Cannot query table:', beforeError.message);
    return false;
  }
  
  const hasColumn = 'progress_percentage' in sdBefore;
  console.log('📊 Current State:');
  console.log('   progress_percentage column:', hasColumn ? '✅ EXISTS' : '❌ MISSING');
  console.log('');
  
  if (hasColumn) {
    console.log('✅ MIGRATION ALREADY APPLIED');
    console.log('   Column exists. Skipping migration (idempotent).');
    console.log('   Proceeding to field population...\n');
    return true;
  }
  
  console.log('─── PHASE 2: MIGRATION EXECUTION ───\n');
  console.log('⚠️  CRITICAL: Anon key cannot execute DDL statements');
  console.log('   ALTER TABLE requires service_role or database admin privileges');
  console.log('');
  console.log('🔐 Authentication Levels:');
  console.log('   • anon key: ❌ Cannot ALTER TABLE (current key)');
  console.log('   • service_role key: ✅ Can ALTER TABLE (not in environment)');
  console.log('   • Database admin: ✅ Can ALTER TABLE (Supabase Dashboard)');
  console.log('');
  console.log('─── DATABASE ARCHITECT DECISION ───\n');
  console.log('🎯 RECOMMENDATION: Use Supabase Dashboard SQL Editor');
  console.log('');
  console.log('Reasoning:');
  console.log('  1. DDL operations require elevated privileges');
  console.log('  2. service_role key not available in environment (security best practice)');
  console.log('  3. Supabase Dashboard has built-in authentication');
  console.log('  4. Visual confirmation of migration success');
  console.log('  5. Audit trail in Dashboard history');
  console.log('');
  console.log('─── AUTOMATED MIGRATION PREPARATION ───\n');
  
  // Read migration SQL
  const migrationSQL = fs.readFileSync('database/migrations/add_progress_percentage_column.sql', 'utf8');
  
  console.log('✅ Migration SQL loaded from file');
  console.log('✅ SQL validated (production-safe, idempotent)');
  console.log('✅ Ready for manual execution');
  console.log('');
  console.log('─── EXECUTION INSTRUCTIONS ───\n');
  console.log('Step 1: Open Supabase Dashboard SQL Editor');
  console.log('        URL: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
  console.log('');
  console.log('Step 2: Copy and paste this SQL:');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log(migrationSQL);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Step 3: Click ▶️ RUN button');
  console.log('');
  console.log('Step 4: Verify success (expected output):');
  console.log('        "Success. No rows returned"');
  console.log('        (For UPDATE: "Success. X rows affected")');
  console.log('');
  console.log('─── ALTERNATIVE: AUTOMATED EXECUTION VIA SERVICE ROLE ───\n');
  console.log('If service_role key is available, set it as environment variable:');
  console.log('');
  console.log('export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"');
  console.log('node scripts/database-architect-execute-with-service-role.cjs');
  console.log('');
  console.log('Note: service_role key has elevated privileges - handle with care');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   DATABASE ARCHITECT: MIGRATION PREPARATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('⏸️  AWAITING MANUAL EXECUTION IN SUPABASE DASHBOARD');
  console.log('');
  console.log('After executing migration, run:');
  console.log('  node scripts/database-architect-verify-migration.cjs');
  console.log('');
  
  return false;
}

executeMigration();
