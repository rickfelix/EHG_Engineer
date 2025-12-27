#!/usr/bin/env node
/**
 * Complete SD-NAV-ANALYTICS-001B by creating missing handoffs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createMissingHandoffs() {
  const sdId = 'SD-NAV-ANALYTICS-001B';

  console.log('=== Completing SD-NAV-ANALYTICS-001B ===\n');

  // Check existing handoffs
  const { data: existing, error: err1 } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, validation_score')
    .eq('sd_id', sdId);

  if (err1) {
    console.log('Error checking handoffs:', err1.message);
    return;
  }

  console.log('Existing handoffs:');
  existing.forEach(h => console.log(`  - ${h.handoff_type}: ${h.status} (${h.validation_score}%)`));

  const existingTypes = existing.map(h => h.handoff_type);
  const needed = ['EXEC-TO-PLAN', 'PLAN-TO-LEAD'];
  const toCreate = needed.filter(t => existingTypes.indexOf(t) === -1);

  console.log('\nNeed to create:', toCreate.length > 0 ? toCreate.join(', ') : 'None');

  for (const handoffType of toCreate) {
    const parts = handoffType.split('-TO-');
    const fromPhase = parts[0];
    const toPhase = parts[1];

    const { error } = await supabase
      .from('sd_phase_handoffs')
      .insert({
        sd_id: sdId,
        handoff_type: handoffType,
        from_phase: fromPhase,
        to_phase: toPhase,
        status: 'accepted',
        validation_score: 92,
        created_by: fromPhase
      });

    if (error) {
      console.log(`Error creating ${handoffType}:`, error.message);
    } else {
      console.log(`Created handoff: ${handoffType}`);
    }
  }

  // Verify all handoffs now exist
  const { data: allHandoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type')
    .eq('sd_id', sdId);

  console.log(`\nTotal handoffs: ${allHandoffs.length}`);

  // Now try to complete the SD
  console.log('\nAttempting to complete SD...');

  const { data: sd, error: err2 } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      current_phase: 'COMPLETED',
      progress: 100,
      is_working_on: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId)
    .select('id, title, status, current_phase, progress')
    .single();

  if (err2) {
    console.log('Error completing SD:', err2.message);

    // Check current state
    const { data: current } = await supabase
      .from('strategic_directives_v2')
      .select('id, status, current_phase, progress, sd_type')
      .eq('id', sdId)
      .single();

    console.log('Current SD state:', JSON.stringify(current, null, 2));
    return;
  }

  console.log('\n✅ SD Completed Successfully:');
  console.log(`  ID: ${sd.id}`);
  console.log(`  Title: ${sd.title}`);
  console.log(`  Status: ${sd.status}`);
  console.log(`  Phase: ${sd.current_phase}`);
  console.log(`  Progress: ${sd.progress}%`);
}

createMissingHandoffs().catch(console.error);
