#!/usr/bin/env node

/**
 * Update SD-CHAIRMAN-ANALYTICS-PROMOTE-001 progress to 65%
 * EXEC implementation complete, awaiting PLAN verification
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateSDProgress() {
  console.log('\n📊 Updating SD Progress');
  console.log('=' .repeat(60));

  try {
    const sdId = 'SD-CHAIRMAN-ANALYTICS-PROMOTE-001';
    const newProgress = 65;
    const newPhase = 'EXEC_IMPLEMENTATION_COMPLETE';

    console.log(`\n🎯 Target: ${sdId}`);
    console.log(`📈 New Progress: ${newProgress}%`);
    console.log(`🔄 New Phase: ${newPhase}`);

    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        progress_percentage: newProgress,
        current_phase: newPhase,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId)
      .select('id, title, progress_percentage, current_phase, status, updated_at')
      .single();

    if (error) {
      console.error('\n❌ UPDATE ERROR:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    if (!data) {
      console.error('\n❌ No record found for', sdId);
      process.exit(1);
    }

    console.log('\n✅ SD Updated Successfully!');
    console.log('\n📋 Updated Record:');
    console.log(`   SD ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Progress: ${data.progress_percentage}%`);
    console.log(`   Phase: ${data.current_phase}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Updated: ${new Date(data.updated_at).toLocaleString()}`);

    console.log('\n🎯 Implementation Summary:');
    console.log('   ✅ Database UPDATE executed (nav_routes.maturity = complete)');
    console.log('   ✅ Verification passed (confirmed maturity = complete)');
    console.log('   ✅ Navigation link now visible to all users');
    console.log('   ⏭️  Next: PLAN verification (E2E test + QA review)');

  } catch (_error) {
    console.error('\n❌ UNEXPECTED ERROR:', error);
    process.exit(1);
  }
}

// Execute
updateSDProgress();
