#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📍 CURRENT STATUS CHECK');
console.log('═'.repeat(60));
console.log('');

async function checkStatus() {
  // Check SD-VENTURE-ARCHETYPES-001 status
  console.log('1. Checking SD-VENTURE-ARCHETYPES-001 status...');
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress')
    .eq('id', 'SD-VENTURE-ARCHETYPES-001')
    .single();

  console.log(`   Status: ${sd.status}`);
  console.log(`   Phase: ${sd.current_phase}`);
  console.log(`   Progress: ${sd.progress}%`);
  console.log('');

  // Check handoffs
  console.log('2. Checking handoffs completed...');
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, created_at, status')
    .eq('sd_id', 'SD-VENTURE-ARCHETYPES-001')
    .order('created_at', { ascending: false });

  if (handoffs && handoffs.length > 0) {
    handoffs.forEach(h => {
      console.log(`   ${h.from_phase} → ${h.to_phase}: ${h.status}`);
    });
  } else {
    console.log('   No handoffs found in database');
  }
  console.log('');

  // Check for other active SDs
  console.log('3. Checking for other active SDs...');
  const { data: activeSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress, priority')
    .in('status', ['active', 'in_progress', 'pending_approval'])
    .order('priority', { ascending: false })
    .limit(10);

  if (activeSDs && activeSDs.length > 0) {
    console.log(`   Found ${activeSDs.length} active SD(s):`);
    activeSDs.forEach(sd => {
      console.log(`   - ${sd.id}: ${sd.title}`);
      console.log(`     Status: ${sd.status}, Phase: ${sd.current_phase}, Progress: ${sd.progress}%, Priority: ${sd.priority}`);
    });
  } else {
    console.log('   No active SDs found');
  }
  console.log('');

  // Determine next action
  console.log('═'.repeat(60));
  console.log('📋 NEXT ACTION RECOMMENDATION');
  console.log('═'.repeat(60));
  console.log('');

  if (sd.status === 'completed' && sd.progress === 100) {
    console.log('✅ SD-VENTURE-ARCHETYPES-001 is COMPLETE');
    console.log('');

    if (activeSDs && activeSDs.length > 0) {
      const topSD = activeSDs[0];
      console.log(`🎯 Next SD to work on: ${topSD.id}`);
      console.log(`   Title: ${topSD.title}`);
      console.log(`   Current Phase: ${topSD.current_phase}`);
      console.log(`   Progress: ${topSD.progress}%`);
      console.log('');
      console.log('   Recommended action:');

      // Determine phase-specific action
      if (topSD.current_phase === 'LEAD_APPROVAL' || topSD.current_phase === 'draft') {
        console.log('   → Phase 1: LEAD Pre-Approval');
        console.log('   → Execute: 5-step SD evaluation + SIMPLICITY FIRST gate');
        console.log('   → Command: node scripts/unified-handoff-system.js execute LEAD-to-PLAN ' + topSD.id);
      } else if (topSD.current_phase === 'PLAN_PRD') {
        console.log('   → Phase 2: PLAN PRD Creation');
        console.log('   → Execute: PRD creation + user stories generation');
        console.log('   → Command: node scripts/add-prd-to-database.js');
      } else if (topSD.current_phase === 'EXEC_IMPLEMENTATION') {
        console.log('   → Phase 3: EXEC Implementation');
        console.log('   → Verify application context (pwd, git remote -v)');
        console.log('   → Execute: Implementation + dual test execution');
      } else if (topSD.current_phase === 'PLAN_VERIFICATION') {
        console.log('   → Phase 4: PLAN Supervisor Verification');
        console.log('   → Wait for CI/CD (2-3 min)');
        console.log('   → Execute: QA Director + DevOps verification');
        console.log('   → Command: node scripts/qa-engineering-director-enhanced.js ' + topSD.id + ' --full-e2e');
      } else if (topSD.current_phase === 'LEAD_FINAL_APPROVAL') {
        console.log('   → Phase 5: LEAD Final Approval');
        console.log('   → Execute: Retrospective generation');
        console.log('   → Command: node scripts/generate-comprehensive-retrospective.js ' + topSD.id);
      }
    } else {
      console.log('🎉 ALL STRATEGIC DIRECTIVES COMPLETE');
      console.log('');
      console.log('   No active SDs requiring work.');
      console.log('   LEO Protocol execution complete for current backlog.');
    }
  } else {
    console.log(`⚠️  SD-VENTURE-ARCHETYPES-001 status: ${sd.status} (expected: completed)`);
    console.log('   Investigation needed');
  }
  console.log('');

  process.exit(0);
}

checkStatus();
