#!/usr/bin/env node
/**
 * Accept EXEC→PLAN Handoff for SD-E2E-INFRASTRUCTURE-001
 * Transition to PLAN Verification Phase
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-E2E-INFRASTRUCTURE-001';

console.log('📥 ACCEPTING EXEC→PLAN HANDOFF');
console.log('═══════════════════════════════════════════════════════════\n');

// Find EXEC→PLAN handoff
const { data: handoff, error: findError } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', SD_ID)
  .eq('from_phase', 'EXEC')
  .eq('to_phase', 'PLAN')
  .eq('status', 'pending_acceptance')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (findError || !handoff) {
  console.error('❌ No pending EXEC→PLAN handoff found');
  console.error('   Error:', findError?.message);
  process.exit(1);
}

console.log('✅ Found EXEC→PLAN handoff');
console.log('   ID:', handoff.id);
console.log('   Created:', handoff.created_at);
console.log('');

// Accept handoff (update status only - table schema doesn't have accepted_by/accepted_at)
const { error: acceptError } = await supabase
  .from('sd_phase_handoffs')
  .update({
    status: 'accepted'
  })
  .eq('id', handoff.id);

if (acceptError) {
  console.error('❌ Error accepting handoff:', acceptError.message);
  process.exit(1);
}

console.log('✅ HANDOFF ACCEPTED');
console.log('');

// Update SD to PLAN phase
const { data: sdUpdate, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .update({
    current_phase: 'PLAN',
    updated_at: new Date().toISOString()
  })
  .eq('id', SD_ID)
  .select()
  .single();

if (sdError) {
  console.error('❌ Error updating SD phase:', sdError.message);
  process.exit(1);
}

console.log('✅ SD UPDATED TO PLAN VERIFICATION PHASE');
console.log('═══════════════════════════════════════════════════════════');
console.log('   SD ID:', sdUpdate.id);
console.log('   Current Phase:', sdUpdate.current_phase);
console.log('   Status:', sdUpdate.status);
console.log('   Progress:', sdUpdate.progress_percentage + '%');
console.log('');
console.log('📋 PLAN VERIFICATION PHASE - NEXT STEPS:');
console.log('───────────────────────────────────────────────────────────');
console.log('   1. Push commit to remote (cd /mnt/c/_EHG/ehg && git push)');
console.log('   2. Wait for CI/CD green (gh run list --limit 5)');
console.log('   3. Execute QA Director (E2E validation)');
console.log('   4. Execute DevOps Architect (CI/CD verification)');
console.log('   5. Aggregate verdicts');
console.log('   6. Create PLAN→LEAD handoff');
console.log('');
