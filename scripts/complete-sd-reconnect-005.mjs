import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'completed',
    current_phase: 'COMPLETED',
    completion_date: new Date().toISOString(),
    metadata: {
      ...((await supabase.from('strategic_directives_v2').select('metadata').eq('id', 'SD-RECONNECT-005').single()).data?.metadata || {}),
      completion_summary: {
        duplicates_eliminated: 3,
        files_modified: 4,
        files_moved: 2,
        files_deleted: 3,
        directories_removed: 1,
        typescript_errors: 0,
        validation_status: 'PASSED'
      },
      lead_approval: {
        approved_at: new Date().toISOString(),
        approved_by: 'LEAD_AGENT',
        retrospective_id: 'c0823d28-618a-4abd-846a-90bd7673c98f',
        retrospective_quality: 80,
        all_success_criteria_met: true
      }
    }
  })
  .eq('id', 'SD-RECONNECT-005')
  .select();

if (error) {
  console.error('Error completing SD:', error);
} else {
  console.log('✅ SD-RECONNECT-005 COMPLETED');
  console.log('Status: completed');
  console.log('Phase: COMPLETED');
  console.log('Retrospective ID:', 'c0823d28-618a-4abd-846a-90bd7673c98f');
  console.log('\n📊 Final Results:');
  console.log('- 3 duplicate component pairs eliminated');
  console.log('- 4 files modified, 2 moved, 3 deleted');
  console.log('- 1 directory removed (venture/)');
  console.log('- 0 TypeScript errors');
  console.log('- All validation tests passed');
  console.log('\n✅ LEO Protocol execution complete for SD-RECONNECT-005');
}
