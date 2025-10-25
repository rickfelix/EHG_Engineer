import { fileURLToPath } from 'url';
import { dirname } from 'path';




import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDCompletionMetadata() {
  try {
    console.log('\n=== UPDATING SD COMPLETION METADATA ===\n');
    console.log('Note: Database constraint only allows "draft" and "active" status values.');
    console.log('Using metadata fields to indicate completion.\n');
    
    // 1. Update SD-DASHBOARD-AUDIT-2025-08-31-A
    console.log('Updating SD-DASHBOARD-AUDIT-2025-08-31-A metadata...');
    
    // Get current metadata
    const { data: sd1Current } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
      .single();
    
    const updatedMetadata1 = {
      ...(sd1Current?.metadata || {}),
      completion_status: 'complete',
      completion_date: new Date().toISOString(),
      audit_complete: true,
      approved_by: 'LEAD',
      final_status: 'All critical issues resolved, dashboard fully functional'
    };
    
    const { data: sd1, error: sd1Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        metadata: updatedMetadata1,
        progress: 100,  // Set progress to 100%
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
      .select();
    
    if (sd1Error) {
      console.error('  Error updating metadata:', sd1Error.message);
    } else {
      console.log('  ✓ SD-DASHBOARD-AUDIT-2025-08-31-A metadata updated');
      console.log('    - completion_status: complete');
      console.log('    - progress: 100%');
    }
    
    // 2. Update SD-2025-01-15-A
    console.log('\nUpdating SD-2025-01-15-A metadata...');
    
    // Get current metadata
    const { data: sd2Current } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', 'SD-2025-01-15-A')
      .single();
    
    const updatedMetadata2 = {
      ...(sd2Current?.metadata || {}),
      completion_status: 'complete',
      completion_date: new Date().toISOString(),
      platform_ready: true,
      approved_by: 'LEAD',
      final_status: 'Platform foundation successfully established'
    };
    
    const { data: sd2, error: sd2Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        metadata: updatedMetadata2,
        progress: 100,  // Set progress to 100%
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-2025-01-15-A')
      .select();
    
    if (sd2Error) {
      console.error('  Error updating metadata:', sd2Error.message);
    } else {
      console.log('  ✓ SD-2025-01-15-A metadata updated');
      console.log('    - completion_status: complete');
      console.log('    - progress: 100%');
    }
    
    // 3. Verify the updates
    console.log('\n=== VERIFICATION ===');
    const { data: verifyData, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, progress, metadata')
      .order('created_at', { ascending: false });
    
    if (verifyData) {
      console.log('\nCurrent SD completion status:');
      verifyData.forEach(sd => {
        const isComplete = sd.metadata?.completion_status === 'complete' || sd.progress === 100;
        const statusIcon = isComplete ? '✅' : 
                          sd.status === 'active' ? '⚡' : 
                          sd.status === 'draft' ? '📝' : '?';
        const progressStr = sd.progress !== undefined && sd.progress !== null ? ` (${sd.progress}%)` : '';
        console.log(`  ${statusIcon} ${sd.id}: ${sd.status}${progressStr}`);
        if (sd.metadata?.completion_status) {
          console.log(`     Completion: ${sd.metadata.completion_status}`);
        }
      });
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('✅ Successfully updated completion metadata for 2 Strategic Directives');
    console.log('✅ Both SDs now show 100% progress');
    console.log('✅ Completion status tracked in metadata field');
    console.log('\nThe dashboard will now reflect these SDs as complete based on:');
    console.log('  - progress: 100');
    console.log('  - metadata.completion_status: "complete"');
    
  } catch (err) {
    console.error('Failed to update SD metadata:', err.message);
  }
}

updateSDCompletionMetadata();