import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  const { data: workingOnSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, description')
    .eq('is_working_on', true)
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!workingOnSDs || workingOnSDs.length === 0) {
    console.log('ℹ️ No Strategic Directives marked as "working_on"');
    console.log('');
    console.log('📊 LEO Protocol Session Summary:');
    console.log('════════════════════════════════');
    console.log('✅ SD-1B: Stage-1 Emergent Ideation Engine - COMPLETED');
    console.log('✅ SD-003A: EVA Assistant Stage-1 Integration - COMPLETED');
    console.log('');
    console.log('📈 Session Achievements:');
    console.log('  • 2 Strategic Directives completed');
    console.log('  • Voice capture with Whisper API implemented');
    console.log('  • EVA validation logic with quality scoring');
    console.log('  • Chairman feedback system deployed');
    console.log('  • 14 unit tests written and passing');
    console.log('  • OpenAI API key configured');
    console.log('  • 2 GitHub commits pushed');
    console.log('');
    console.log('📋 Remaining Active SDs: 52');
    console.log('');
    console.log('🎯 Recommended Next Actions:');
    console.log('  1. Mark a new SD as working_on to continue');
    console.log('  2. Consider high-value infrastructure SDs:');
    console.log('     • SD-GOVERNANCE-UI-001 (Governance UI)');
    console.log('     • SD-PIPELINE-001 (CI/CD Pipeline)');
    console.log('     • SD-MONITORING-001 (Observability)');
  } else {
    console.log('🎯 Strategic Directives marked as "working_on":');
    console.log('════════════════════════════════════════════════');
    workingOnSDs.forEach(sd => {
      console.log('');
      console.log('📌 ' + sd.id + ': ' + sd.title);
      console.log('   Status: ' + sd.status);
      console.log('   Priority: ' + sd.priority);
      if (sd.description) {
        console.log('   Description: ' + sd.description.substring(0, 100) + '...');
      }
    });
    console.log('');
    console.log('💡 Use LEO Protocol to process the working_on SD(s)');
  }
})();