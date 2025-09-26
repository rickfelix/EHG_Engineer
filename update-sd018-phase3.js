const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.log('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateSD018Progress() {
  try {
    console.log('🔄 Updating SD-018 Phase 3 completion...');

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        progress: 100,
        status: 'pending_approval',
        metadata: {
          current_phase: 'EXEC_PHASE_3_COMPLETE',
          phase_progress: {
            EXEC: 100,
            LEAD: 100,
            PLAN: 100,
            APPROVAL: 0,
            VERIFICATION: 0
          },
          completion_notes: 'Phase 3: Analytics & Integration completed successfully - Portfolio performance analytics, team transition dashboard, and export functionality implemented',
          phases_completed: ['PHASE_1_PORTFOLIO_DASHBOARD', 'PHASE_2_EXIT_WORKFLOW', 'PHASE_3_ANALYTICS_INTEGRATION']
        }
      })
      .eq('id', 'SD-018')
      .select();

    if (error) throw error;

    console.log('✅ SD-018 updated successfully:', data[0]);
    console.log('📊 Progress: 100% - Ready for LEAD final approval');

  } catch (error) {
    console.error('❌ Error updating SD-018:', error);
  }
}

updateSD018Progress();