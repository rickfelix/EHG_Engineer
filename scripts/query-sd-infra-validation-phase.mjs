#!/usr/bin/env node
/**
 * Query SD-INFRA-VALIDATION Current Phase
 * Determine next phase to execute
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-INFRA-VALIDATION';

console.log('🔍 PHASE DETECTION: SD-INFRA-VALIDATION');
console.log('═══════════════════════════════════════════════════════════\n');

// Query SD status
console.log('1. Current SD Status:');
console.log('───────────────────────────────────────────────────────────');
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress')
  .eq('id', SD_ID)
  .single();

if (sdError) {
  console.error('❌ Error querying SD:', sdError.message);
} else {
  console.log('   ID:', sd.id);
  console.log('   Title:', sd.title);
  console.log('   Status:', sd.status);
  console.log('   Current Phase:', sd.current_phase || 'N/A');
  console.log('   Progress:', sd.progress + '%');
}

console.log('\n2. Completed Handoffs:');
console.log('───────────────────────────────────────────────────────────');
const { data: handoffs, error: handoffsError } = await supabase
  .from('sd_phase_handoffs')
  .select('from_phase, to_phase, status, created_at, accepted_at')
  .eq('sd_id', SD_ID)
  .order('created_at', { ascending: false });

if (handoffsError) {
  console.error('❌ Error querying handoffs:', handoffsError.message);
} else {
  handoffs.forEach((h, i) => {
    console.log(`   ${i + 1}. ${h.from_phase}→${h.to_phase}`);
    console.log(`      Status: ${h.status}`);
    console.log(`      Created: ${h.created_at}`);
    if (h.accepted_at) console.log(`      Accepted: ${h.accepted_at}`);
    console.log('');
  });
}

console.log('\n3. Phase Determination:');
console.log('───────────────────────────────────────────────────────────');

// Determine current phase based on handoffs
const planToLead = handoffs?.find(h => h.from_phase === 'PLAN' && h.to_phase === 'LEAD');
const execToPlan = handoffs?.find(h => h.from_phase === 'EXEC' && h.to_phase === 'PLAN');
const planToExec = handoffs?.find(h => h.from_phase === 'PLAN' && h.to_phase === 'EXEC');
const leadToPlan = handoffs?.find(h => h.from_phase === 'LEAD' && h.to_phase === 'PLAN');

if (planToLead && planToLead.status === 'pending_acceptance') {
  console.log('📍 Current Phase: LEAD Final Approval (Phase 5)');
  console.log('   ✅ PLAN→LEAD handoff created (pending acceptance)');
  console.log('   📋 Next Actions:');
  console.log('      1. Accept PLAN→LEAD handoff');
  console.log('      2. Review verification results (≥85% confidence)');
  console.log('      3. Execute LEAD sub-agent validation');
  console.log('      4. Generate retrospective (MANDATORY)');
  console.log('      5. Mark SD complete');
  console.log('');
  console.log('   🎯 Load Context: CLAUDE_LEAD.md (25k chars)');
} else if (execToPlan && execToPlan.status === 'accepted') {
  console.log('📍 Current Phase: PLAN Verification (Phase 4)');
  console.log('   ✅ EXEC→PLAN handoff accepted');
  console.log('   📋 Next Actions:');
  console.log('      1. Run verification sub-agents (TESTING, GITHUB, DOCMON)');
  console.log('      2. Aggregate verification results');
  console.log('      3. Create PLAN→LEAD handoff');
  console.log('');
  console.log('   🎯 Load Context: CLAUDE_PLAN.md (30k chars)');
} else if (planToExec && planToExec.status === 'accepted') {
  console.log('📍 Current Phase: EXEC Implementation (Phase 3)');
  console.log('   ✅ PLAN→EXEC handoff accepted');
  console.log('   📋 Next Actions:');
  console.log('      1. Implement PRD requirements');
  console.log('      2. Write dual tests (unit + E2E)');
  console.log('      3. Git commit with SD-ID');
  console.log('      4. Wait for CI/CD green');
  console.log('      5. Create EXEC→PLAN handoff');
  console.log('');
  console.log('   🎯 Load Context: CLAUDE_EXEC.md (20k chars)');
} else if (leadToPlan && leadToPlan.status === 'accepted') {
  console.log('📍 Current Phase: PLAN PRD Creation (Phase 2)');
  console.log('   ✅ LEAD→PLAN handoff accepted');
  console.log('   📋 Next Actions:');
  console.log('      1. Create PRD in database');
  console.log('      2. Generate user stories');
  console.log('      3. Database validation');
  console.log('      4. Create PLAN→EXEC handoff');
  console.log('');
  console.log('   🎯 Load Context: CLAUDE_PLAN.md (30k chars)');
} else {
  console.log('📍 Current Phase: LEAD Pre-Approval (Phase 1)');
  console.log('   📋 Next Actions:');
  console.log('      1. Strategic validation (6-step evaluation)');
  console.log('      2. Run parallel sub-agents');
  console.log('      3. Over-engineering check');
  console.log('      4. Create LEAD→PLAN handoff');
  console.log('');
  console.log('   🎯 Load Context: CLAUDE_LEAD.md (25k chars)');
}

console.log('\n═══════════════════════════════════════════════════════════\n');
