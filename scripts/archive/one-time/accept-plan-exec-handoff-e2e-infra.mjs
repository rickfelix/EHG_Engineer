#!/usr/bin/env node
/**
 * Accept PLAN→EXEC Handoff for SD-E2E-INFRASTRUCTURE-001
 * Transition to EXEC Implementation Phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-E2E-INFRASTRUCTURE-001';

console.log('📥 ACCEPTING PLAN→EXEC HANDOFF');
console.log('═══════════════════════════════════════════════════════════\n');

// Find PLAN→EXEC handoff
const { data: handoff, error: findError } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', SD_ID)
  .eq('from_phase', 'PLAN')
  .eq('to_phase', 'EXEC')
  .eq('status', 'pending_acceptance')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (findError || !handoff) {
  console.error('❌ No pending PLAN→EXEC handoff found');
  console.error('   Error:', findError?.message);
  process.exit(1);
}

console.log('✅ Found PLAN→EXEC handoff');
console.log('   ID:', handoff.id);
console.log('   Created:', handoff.created_at);

// Use accept_phase_handoff RPC function (created in SD-INFRA-VALIDATION)
const { data: result, error: acceptError } = await supabase.rpc('accept_phase_handoff', {
  handoff_id_param: handoff.id
});

if (acceptError) {
  console.error('❌ Error accepting handoff:', acceptError.message);
  process.exit(1);
}

console.log('\n✅ HANDOFF ACCEPTED');
console.log('═══════════════════════════════════════════════════════════');
console.log('   Handoff ID:', handoff.id);
console.log('   Status: accepted');
console.log('   Accepted At:', new Date().toISOString());
console.log('');

// Update SD to EXEC phase
const { data: sdUpdate, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .update({
    current_phase: 'EXEC',
    updated_at: new Date().toISOString()
  })
  .eq('id', SD_ID)
  .select()
  .single();

if (sdError) {
  console.error('❌ Error updating SD phase:', sdError.message);
  process.exit(1);
}

console.log('✅ SD UPDATED TO EXEC PHASE');
console.log('═══════════════════════════════════════════════════════════');
console.log('   SD ID:', sdUpdate.id);
console.log('   Current Phase:', sdUpdate.current_phase);
console.log('   Status:', sdUpdate.status);
console.log('');

console.log('📋 EXEC PHASE ACTION ITEMS (from handoff):');
console.log('───────────────────────────────────────────────────────────');
console.log('1. Navigate to ../ehg (EHG application)');
console.log('2. Implement selector utilities (~200 LOC)');
console.log('3. Refactor auth fixture (~150 LOC)');
console.log('4. Standardize wait patterns (~100 LOC)');
console.log('5. Create documentation (README.md)');
console.log('6. Refactor 5 example tests');
console.log('7. Write unit tests (80%+ coverage)');
console.log('8. Git commit with SD-ID');
console.log('9. Wait for CI/CD green');
console.log('10. Create EXEC→PLAN handoff');
console.log('');
console.log('🎯 Load Context: CLAUDE_EXEC.md (20k chars)');
console.log('📍 Implementation Directory: ../ehg');
console.log('⏱️  Estimated Duration: 7-10 hours');
console.log('');
