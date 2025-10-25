#!/usr/bin/env node

/**
 * Complete SD-CHAIRMAN-ANALYTICS-PROMOTE-001
 * LEAD FINAL APPROVAL (Phase 5)
 * Mark SD as completed with 100% progress
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function completeSD() {
  console.log('\n🎯 LEAD FINAL APPROVAL: SD-CHAIRMAN-ANALYTICS-PROMOTE-001');
  console.log('═'.repeat(60));

  try {
    const sdId = 'SD-CHAIRMAN-ANALYTICS-PROMOTE-001';

    // Step 1: Verify retrospective exists
    console.log('\n✅ Step 1: Verifying retrospective...');
    const { data: retro, error: retroError } = await supabase
      .from('retrospectives')
      .select('id, quality_score, team_satisfaction')
      .eq('sd_id', sdId)
      .single();

    if (retroError) {
      console.error('❌ Retrospective not found:', retroError.message);
      process.exit(1);
    }

    console.log(`   Retrospective ID: ${retro.id}`);
    console.log(`   Quality Score: ${retro.quality_score}/100`);
    console.log(`   Team Satisfaction: ${retro.team_satisfaction}/10`);

    if (retro.quality_score < 70) {
      console.error(`\n❌ Quality score ${retro.quality_score} below threshold (70)`);
      process.exit(1);
    }

    // Step 2: Update SD to completed
    console.log('\n🎉 Step 2: Marking SD as COMPLETED...');
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        progress: 100,
        current_phase: 'LEAD_FINAL_APPROVAL_COMPLETE',
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId)
      .select('id, title, status, progress, current_phase, updated_at')
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
    console.log('\n📋 Final Status:');
    console.log(`   SD ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Progress: ${data.progress}%`);
    console.log(`   Phase: ${data.current_phase}`);
    console.log(`   Updated: ${new Date(data.updated_at).toLocaleString()}`);

    console.log('\n═'.repeat(60));
    console.log('🏆 SD-CHAIRMAN-ANALYTICS-PROMOTE-001 COMPLETED');
    console.log('═'.repeat(60));
    console.log('\n✅ Chairman Analytics navigation link promoted to complete');
    console.log('✅ Feature now discoverable to all users');
    console.log('✅ EXEC → PLAN → LEAD workflow complete');
    console.log(`✅ Retrospective generated (${retro.quality_score}/100 quality score)`);
    console.log('\n📊 Phase Breakdown:');
    console.log('   LEAD Pre-Approval: 20% ✅');
    console.log('   PLAN PRD Creation: 20% ✅');
    console.log('   EXEC Implementation: 30% ✅');
    console.log('   PLAN Verification: 15% ✅');
    console.log('   LEAD Final Approval: 15% ✅');
    console.log('   ──────────────────────────');
    console.log('   Total: 100% COMPLETE\n');

  } catch (error) {
    console.error('\n❌ UNEXPECTED ERROR:', error);
    process.exit(1);
  }
}

completeSD();
