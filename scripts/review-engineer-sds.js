#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function reviewEHGEngineerSDs() {
  console.log('\n=================================');
  console.log('EHG_ENGINEER Strategic Directives Review');
  console.log('=================================\n');

  // Get all EHG_ENGINEER targeted SDs
  const { data: engineerSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('target_application', 'EHG_ENGINEER')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching SDs:', error);
    return;
  }

  console.log('Found', engineerSDs?.length || 0, 'EHG_ENGINEER strategic directives\n');

  // Group by status
  const byStatus = {};
  engineerSDs?.forEach(sd => {
    if (!byStatus[sd.status]) byStatus[sd.status] = [];
    byStatus[sd.status].push(sd);
  });

  // Display by status
  for (const [status, sds] of Object.entries(byStatus)) {
    console.log('\n' + status.toUpperCase() + ' (' + sds.length + '):');
    console.log('-'.repeat(40));

    sds.forEach(sd => {
      console.log(`• ${sd.id}: ${sd.title}`);
      console.log(`  Priority: ${sd.priority || 'Not set'}`);
      console.log(`  Progress: ${sd.progress || 0}%`);
      if (sd.id === 'SD-002') {
        console.log('  >>> DETAILED SD-002 INFO <<<');
        console.log('  Status:', sd.status);
        console.log('  Created:', sd.created_at);
        console.log('  Updated:', sd.updated_at);
      }
    });
  }

  // Now specifically check SD-002
  console.log('\n\n=================================');
  console.log('SD-002 DETAILED INVESTIGATION');
  console.log('=================================\n');

  const { data: sd002, error: sd002Error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-002')
    .single();

  if (sd002) {
    console.log('SD-002 Full Details:');
    console.log('-------------------');
    console.log('Title:', sd002.title);
    console.log('Status:', sd002.status);
    console.log('Progress:', sd002.progress, '%');
    console.log('Priority:', sd002.priority);
    console.log('Target App:', sd002.target_application);
    console.log('Created:', sd002.created_at);
    console.log('Updated:', sd002.updated_at);

    // Check for completion fields
    console.log('\nCompletion Tracking:');
    console.log('Present in latest import:', sd002.present_in_latest_import);
    console.log('Import run ID:', sd002.import_run_id);

    // Check phase tracking
    console.log('\nPhase Tracking:');
    console.log('Current Phase:', sd002.current_phase || 'Not set');
    console.log('Phase Progress:', sd002.phase_progress || 'Not tracked');
  }

  // Check phase completion
  const { data: phases, error: phaseError } = await supabase
    .from('sd_phase_tracking')
    .select('*')
    .eq('sd_id', 'SD-002')
    .order('phase_name');

  if (phases && phases.length > 0) {
    console.log('\nPhase Completion Status:');
    console.log('------------------------');
    phases.forEach(phase => {
      const status = phase.is_complete ? '✅' : '⏳';
      console.log(`${status} ${phase.phase_name}: ${phase.progress}%`);
      if (phase.completed_at) {
        console.log('   Completed:', phase.completed_at);
      }
    });

    // Calculate overall progress
    const totalProgress = phases.reduce((sum, p) => sum + (p.progress || 0), 0);
    const avgProgress = Math.round(totalProgress / phases.length);
    console.log('\nCalculated Overall Progress:', avgProgress + '%');
  } else {
    console.log('\nNo phase tracking data found for SD-002');
  }

  // Check for PRDs
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, phase')
    .eq('directive_id', 'SD-002');

  if (prds && prds.length > 0) {
    console.log('\nAssociated PRDs:');
    console.log('----------------');
    prds.forEach(prd => {
      console.log(`• ${prd.id}: ${prd.title}`);
      console.log(`  Status: ${prd.status} | Phase: ${prd.phase}`);
    });
  }

  // Check progress calculation
  console.log('\n\n=================================');
  console.log('PROGRESS CALCULATION ANALYSIS');
  console.log('=================================\n');

  const { data: progressData } = await supabase
    .rpc('calculate_sd_progress', { p_sd_id: 'SD-002' });

  if (progressData) {
    console.log('Database calculated progress:', progressData);
  }

  // Get all other EHG_ENGINEER SDs for prioritization
  console.log('\n\n=================================');
  console.log('PENDING EHG_ENGINEER WORK');
  console.log('=================================\n');

  const pendingWork = engineerSDs?.filter(sd =>
    ['active', 'in_progress', 'draft'].includes(sd.status) &&
    sd.id !== 'SD-002'
  );

  if (pendingWork && pendingWork.length > 0) {
    console.log('Strategic Directives ready for work:\n');
    pendingWork.forEach(sd => {
      const priority = sd.priority || 50;
      const urgency = priority >= 80 ? '🔴 CRITICAL' :
                      priority >= 60 ? '🟠 HIGH' :
                      priority >= 40 ? '🟡 MEDIUM' : '🟢 LOW';

      console.log(`${urgency} ${sd.id}: ${sd.title}`);
      console.log(`  Status: ${sd.status} | Progress: ${sd.progress || 0}%`);
      console.log(`  Description: ${sd.description?.substring(0, 100)}...`);
      console.log('');
    });
  } else {
    console.log('No pending EHG_ENGINEER strategic directives found.');
  }
}

reviewEHGEngineerSDs().catch(console.error);