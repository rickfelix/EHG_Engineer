import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testHandoffTemplateId() {
  console.log('🧪 Testing handoff creation with template_id column...\n');

  // Test 1: Insert handoff without template_id (should work - nullable column)
  console.log('Test 1: Creating handoff WITHOUT template_id');
  const testHandoff1 = {
    sd_id: 'SD-DATABASE-SCHEMA-FIXES-001',
    from_phase: 'PLAN',
    to_phase: 'EXEC',
    handoff_type: 'PLAN-to-EXEC',
    status: 'pending',
    timestamp: new Date().toISOString(),
    agent_role: 'EXEC',
    summary: 'Test handoff without template_id',
    verification_results: {},
    next_steps: [],
    blockers: [],
    risks: []
  };

  const { data: h1, error: e1 } = await supabase
    .from('sd_phase_handoffs')
    .insert(testHandoff1)
    .select()
    .single();

  if (e1) {
    console.log('   ❌ FAILED:', e1.message);
  } else {
    console.log('   ✅ SUCCESS: Handoff created:', h1.handoff_id);
    console.log('      template_id:', h1.template_id || '(null)');
  }

  // Test 2: Insert handoff with template_id (should work)
  console.log('\nTest 2: Creating handoff WITH template_id');
  const testHandoff2 = {
    sd_id: 'SD-DATABASE-SCHEMA-FIXES-001',
    from_phase: 'EXEC',
    to_phase: 'PLAN',
    handoff_type: 'EXEC-to-PLAN',
    status: 'pending',
    timestamp: new Date().toISOString(),
    agent_role: 'PLAN',
    template_id: 'strategic_to_technical',
    summary: 'Test handoff with template_id',
    verification_results: {},
    next_steps: [],
    blockers: [],
    risks: []
  };

  const { data: h2, error: e2 } = await supabase
    .from('sd_phase_handoffs')
    .insert(testHandoff2)
    .select()
    .single();

  if (e2) {
    console.log('   ❌ FAILED:', e2.message);
  } else {
    console.log('   ✅ SUCCESS: Handoff created:', h2.handoff_id);
    console.log('      template_id:', h2.template_id);
  }

  // Test 3: Query handoffs by template_id
  console.log('\nTest 3: Querying handoffs by template_id');
  const { data: handoffs, error: e3 } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_id, template_id, summary')
    .eq('template_id', 'strategic_to_technical');

  if (e3) {
    console.log('   ❌ FAILED:', e3.message);
  } else {
    console.log(`   ✅ SUCCESS: Found ${handoffs.length} handoff(s) with template_id='strategic_to_technical'`);
    handoffs.forEach(h => {
      console.log(`      - ${h.handoff_id}: ${h.summary}`);
    });
  }

  // Cleanup: Delete test handoffs
  console.log('\n🧹 Cleaning up test handoffs...');
  if (h1?.handoff_id) {
    await supabase.from('sd_phase_handoffs').delete().eq('handoff_id', h1.handoff_id);
    console.log('   Deleted:', h1.handoff_id);
  }
  if (h2?.handoff_id) {
    await supabase.from('sd_phase_handoffs').delete().eq('handoff_id', h2.handoff_id);
    console.log('   Deleted:', h2.handoff_id);
  }

  console.log('\n✅ Template_id column testing complete');
}

testHandoffTemplateId().catch(console.error);
