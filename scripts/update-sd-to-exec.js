#!/usr/bin/env node
/**
 * Update SD-E2E-STORY-MAPPING-001 to EXEC Phase
 *
 * This script updates:
 * 1. strategic_directives_v2: status='active', current_phase='EXEC', progress=50
 * 2. product_requirements_v2: status='in_progress', phase='exec'
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:');
  console.error('   SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSDToExec() {
  const sdId = 'SD-E2E-STORY-MAPPING-001';
  const prdId = 'PRD-SD-E2E-STORY-MAPPING-001';

  console.log('📊 Querying current state...\n');

  // Check current state
  const { data: currentSD, error: sdQueryError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress')
    .eq('id', sdId)
    .single();

  if (sdQueryError) {
    console.error('❌ Error querying SD:', sdQueryError.message);
    return;
  }

  const { data: currentPRD, error: prdQueryError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, phase')
    .eq('id', prdId)
    .single();

  if (prdQueryError) {
    console.error('❌ Error querying PRD:', prdQueryError.message);
    return;
  }

  console.log('CURRENT STATE:');
  console.log('Strategic Directive:', JSON.stringify(currentSD, null, 2));
  console.log('\nPRD:', JSON.stringify(currentPRD, null, 2));

  console.log('\n📝 Updating to EXEC phase...\n');

  // Update Strategic Directive
  const { data: updatedSD, error: sdUpdateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      current_phase: 'EXEC',
      progress: 50,
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId)
    .select()
    .single();

  if (sdUpdateError) {
    console.error('❌ Error updating SD:', sdUpdateError.message);
    return;
  }

  console.log('✅ Updated Strategic Directive:');
  console.log('   SD ID:', updatedSD.id);
  console.log('   Status:', currentSD.status, '→', updatedSD.status);
  console.log('   Phase:', currentSD.current_phase, '→', updatedSD.current_phase);
  console.log('   Progress:', currentSD.progress, '→', updatedSD.progress);

  // Update PRD
  const { data: updatedPRD, error: prdUpdateError } = await supabase
    .from('product_requirements_v2')
    .update({
      status: 'in_progress',
      phase: 'exec',
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single();

  if (prdUpdateError) {
    console.error('❌ Error updating PRD:', prdUpdateError.message);
    return;
  }

  console.log('\n✅ Updated PRD:');
  console.log('   PRD ID:', updatedPRD.id);
  console.log('   Status:', currentPRD.status, '→', updatedPRD.status);
  console.log('   Phase:', currentPRD.phase, '→', updatedPRD.phase);

  console.log('\n🎉 Update complete! SD is now in EXEC phase with 50% progress.');
}

updateSDToExec().catch(console.error);
