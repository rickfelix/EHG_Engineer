#!/usr/bin/env node

/**
 * Quick script to create a UAT test run
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function createTestRun() {
  console.log('🚀 Creating UAT Test Run...\n');

  const { data: run, error } = await supabase
    .from('uat_runs')
    .insert({
      app: 'EHG',
      env_url: 'http://localhost:5173',
      app_version: '1.0.0',
      browser: 'Chrome',
      role: 'Admin',
      notes: 'UAT testing session - ready to begin',
      started_at: new Date().toISOString(),
      created_by: 'UAT_LEAD'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating run:', error.message);
    process.exit(1);
  }

  console.log('✅ Test run created successfully!\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║                    RUN DETAILS                        ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`  Run ID:      ${run.id}`);
  console.log(`  Environment: ${run.env_url}`);
  console.log(`  Browser:     ${run.browser}`);
  console.log(`  Role:        ${run.role}`);
  console.log(`  Started:     ${new Date(run.started_at).toLocaleString()}`);
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Copy the Run ID above');
  console.log('2. Set the environment variable:');
  console.log(`   export UAT_RUN_ID=${run.id}`);
  console.log('3. Start the UAT Wizard:');
  console.log('   node scripts/uat-wizard-simple.js');
  console.log('\n4. Monitor progress at: http://localhost:3000/uat-dashboard\n');

  // Also write to a file for easy access
  const fs = (await import('fs')).default;
  fs.writeFileSync('.uat-run-id', run.id);
  console.log('💡 Tip: Run ID also saved to .uat-run-id file\n');
}

createTestRun();