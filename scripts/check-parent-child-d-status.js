#!/usr/bin/env node
/**
 * Check Parent SD and Child D status for SD-VISION-TRANSITION-001D activation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkParentAndChildD() {
  console.log('='.repeat(60));
  console.log('Parent-Child SD Status Check');
  console.log('='.repeat(60));

  // Check Parent SD status
  const { data: parent, error: _parentError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress')
    .eq('id', 'SD-VISION-TRANSITION-001')
    .single();

  console.log('\n1. PARENT SD STATUS:');
  console.log('   ID:', parent?.id);
  console.log('   Title:', parent?.title);
  console.log('   Status:', parent?.status);
  console.log('   Phase:', parent?.current_phase);
  console.log('   Progress:', parent?.progress + '%');

  // Check if Parent needs to be in EXEC phase
  const parentInExec = parent?.current_phase === 'EXEC' || parent?.current_phase === 'EXEC_IMPL';
  console.log('\n   Parent in EXEC phase:', parentInExec ? '✅ YES' : '❌ NO (needs update)');

  // Get Child D details
  const { data: childD, error: childDError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress, scope, priority, sd_type, category')
    .eq('id', 'SD-VISION-TRANSITION-001D')
    .single();

  console.log('\n2. CHILD D DETAILS:');
  if (childD) {
    console.log('   ID:', childD.id);
    console.log('   Title:', childD.title);
    console.log('   Status:', childD.status);
    console.log('   Phase:', childD.current_phase);
    console.log('   Progress:', childD.progress + '%');
    console.log('   Scope:', childD.scope?.substring(0, 100) + '...');
    console.log('   Priority:', childD.priority);
    console.log('   SD Type:', childD.sd_type);
    console.log('   Category:', childD.category);
  } else {
    console.log('   Error:', childDError?.message || 'Not found');
  }

  // If parent not in EXEC, update it
  if (!parentInExec) {
    console.log('\n3. UPDATING PARENT TO EXEC PHASE...');
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        current_phase: 'EXEC',
        status: 'active'
      })
      .eq('id', 'SD-VISION-TRANSITION-001');

    if (updateError) {
      console.log('   Error:', updateError.message);
    } else {
      console.log('   ✅ Parent updated to EXEC phase');
    }
  }

  // Verify final state
  const { data: finalParent } = await supabase
    .from('strategic_directives_v2')
    .select('id, current_phase, status')
    .eq('id', 'SD-VISION-TRANSITION-001')
    .single();

  console.log('\n4. FINAL PARENT STATE:');
  console.log('   Phase:', finalParent?.current_phase);
  console.log('   Status:', finalParent?.status);
  console.log('   Ready for child activation:', finalParent?.current_phase === 'EXEC' ? '✅ YES' : '❌ NO');
}

checkParentAndChildD().catch(console.error);
