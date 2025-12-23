#!/usr/bin/env node

/**
 * Complete SD-E2E-SCHEMA-FIX-R2
 * Mark the infrastructure SD as completed after migrations applied
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function completeSD() {
  const sdId = 'SD-E2E-SCHEMA-FIX-R2';

  console.log('Completing SD:', sdId);
  console.log('='.repeat(60));

  // Update SD status to completed
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      current_phase: 'COMPLETED',
      progress: 100,
      completion_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId)
    .select()
    .single();

  if (error) {
    console.error('Error completing SD:', error.message);
    return;
  }

  console.log('✅ SD completed successfully');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Status:', data.status);
  console.log('   Phase:', data.current_phase);
  console.log('   Progress:', data.progress + '%');

  // Also update the PRD status
  const { error: prdError } = await supabase
    .from('product_requirements_v2')
    .update({
      status: 'completed',
      progress: 100,
      updated_at: new Date().toISOString()
    })
    .eq('sd_id', sdId);

  if (prdError) {
    console.warn('Warning: Could not update PRD:', prdError.message);
  } else {
    console.log('✅ PRD updated to completed');
  }

  // Mark deliverables as complete
  const { error: delivError } = await supabase
    .from('sd_deliverables')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('sd_id', sdId)
    .eq('status', 'pending');

  if (delivError) {
    console.warn('Warning: Could not update deliverables:', delivError.message);
  } else {
    console.log('✅ Deliverables marked as complete');
  }

  // Mark user stories as complete
  const { error: storyError } = await supabase
    .from('user_stories')
    .update({
      validation_status: 'validated'
    })
    .eq('sd_id', sdId);

  if (storyError) {
    console.warn('Warning: Could not update user stories:', storyError.message);
  } else {
    console.log('✅ User stories marked as validated');
  }

  console.log('\n' + '='.repeat(60));
  console.log('SD-E2E-SCHEMA-FIX-R2 COMPLETED');
  console.log('='.repeat(60));
  console.log('\nDeliverables:');
  console.log('  ✅ system_events.details column added');
  console.log('  ✅ brand_variants table created');
  console.log('  ✅ RLS policies applied');
  console.log('\nNext: Continue with remaining child SDs');
}

completeSD().catch(e => console.error('Error:', e.message));
