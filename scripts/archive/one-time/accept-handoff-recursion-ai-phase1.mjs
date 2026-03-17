import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('📥 Accepting EXEC→PLAN Handoff for SD-RECURSION-AI-001...\n');

  // Accept handoff
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('id', '97a4e528-f2da-41dd-8c74-743962b05871')
    .select()
    .single();

  if (error) {
    console.error('❌ Error accepting handoff:', error.message);
    process.exit(1);
  }

  console.log('✅ Handoff accepted successfully!');
  console.log('   Handoff ID:', data.id);
  console.log('   Status:', data.status);
  console.log('   From:', data.from_phase, '→', data.to_phase);
  console.log('   Validation Score:', data.validation_score);
  console.log('   Accepted at:', data.accepted_at);

  // Update SD to PLAN verification phase
  console.log('\n📊 Updating SD to PLAN verification phase...');
  const { error: sdError } = await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'PLAN_VERIFY',
      progress_percentage: 45,  // Phase 1 complete (25%) + verification in progress (20%) = 45%
      updated_at: new Date().toISOString()
    })
    .eq('sd_key', 'SD-RECURSION-AI-001');

  if (sdError) {
    console.error('❌ Error updating SD:', sdError.message);
    process.exit(1);
  }

  console.log('✅ SD transitioned to PLAN verification phase');
  console.log('   Current Phase: PLAN_VERIFY');
  console.log('   Progress: 45%');

  console.log('\n🎯 Next Steps:');
  console.log('   1. Fix Supabase mock issues (6 tests, 30 min)');
  console.log('   2. Run E2E tests (30 min)');
  console.log('   3. Performance benchmarking (1 hour)');
  console.log('   4. Create PLAN→LEAD handoff');
})();
