#!/usr/bin/env node
/**
 * Deploy User Story Validation Fix Migration
 * Fixes: PLAN_verification requiring e2e_test_status = 'passing' for non-UI SDs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function deployFix() {
  console.log('🚀 Deploying User Story Validation Fix\n');

  const migrationFile = '/mnt/c/_EHG/EHG_Engineer/database/migrations/20251016_fix_user_story_validation_check.sql';
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Reading migration file...');
  console.log(`File: ${migrationFile}`);
  console.log(`Size: ${(sql.length / 1024).toFixed(1)} KB\n`);

  console.log('Executing migration...');
  const { data: _data, error } = await supabase.rpc('exec_raw_sql', { sql });

  if (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  console.log('✅ Migration deployed successfully\n');

  // Verify fix
  console.log('Verifying fix for SD-RETRO-ENHANCE-001...');
  const { data: breakdown } = await supabase.rpc('get_progress_breakdown', {
    sd_id_param: 'SD-RETRO-ENHANCE-001'
  });

  if (breakdown) {
    const planVerification = breakdown.phases.PLAN_verification;
    const totalProgress = breakdown.total_progress;

    console.log('\n📊 Progress Breakdown:');
    console.log(`   Total Progress: ${totalProgress}%`);
    console.log('   PLAN_verification:');
    console.log(`     - user_stories_validated: ${planVerification.user_stories_validated}`);
    console.log(`     - progress: ${planVerification.progress}/${planVerification.weight}`);

    if (totalProgress === 100) {
      console.log('\n✅ SUCCESS: SD-RETRO-ENHANCE-001 now at 100%!');
      console.log('   Bug fix verified - validation_status check working correctly');
    } else {
      console.log(`\n⚠️  Progress is ${totalProgress}%, expected 100%`);
      console.log('   Additional issues may exist');
    }
  }
}

deployFix().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
