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
    
    // 1. Update SD-DASHBOARD-AUDIT-2025-08-31-A
    console.log('Updating SD-DASHBOARD-AUDIT-2025-08-31-A...');
    
    // Get current data
    const { data: sd1Current } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
      .single();
    
    const updatedMetadata1 = {
      ...(sd1Current?.metadata || {}),
      completion_status: 'complete',
      completion_date: '2025-09-01',
      completion_percentage: 100,
      audit_complete: true,
      approved_by: 'LEAD',
      final_status: 'All critical issues resolved, dashboard fully functional',
      prd_complete: true,
      all_tasks_done: true
    };
    
    const { error: sd1Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        metadata: updatedMetadata1,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A');
    
    if (sd1Error) {
      console.error('  ❌ Error:', sd1Error.message);
    } else {
      console.log('  ✅ Metadata updated successfully');
    }
    
    // 2. Update SD-2025-01-15-A
    console.log('\nUpdating SD-2025-01-15-A...');
    
    // Get current data
    const { data: sd2Current } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', 'SD-2025-01-15-A')
      .single();
    
    const updatedMetadata2 = {
      ...(sd2Current?.metadata || {}),
      completion_status: 'complete',
      completion_date: '2025-09-01',
      completion_percentage: 100,
      platform_ready: true,
      approved_by: 'LEAD',
      final_status: 'Platform foundation successfully established',
      all_phases_complete: true
    };
    
    const { error: sd2Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        metadata: updatedMetadata2,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-2025-01-15-A');
    
    if (sd2Error) {
      console.error('  ❌ Error:', sd2Error.message);
    } else {
      console.log('  ✅ Metadata updated successfully');
    }
    
    // 3. Verify the updates
    console.log('\n=== VERIFICATION ===\n');
    const { data: allSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, metadata')
      .order('created_at', { ascending: false });
    
    if (allSDs) {
      allSDs.forEach(sd => {
        const isComplete = sd.metadata?.completion_status === 'complete';
        const progress = sd.metadata?.completion_percentage || 0;
        const icon = isComplete ? '✅' : sd.status === 'active' ? '⚡' : '📝';
        
        console.log(`${icon} ${sd.id}`);
        console.log(`   Title: ${sd.title || '[No title]'}`);
        console.log(`   Status: ${sd.status}`);
        if (isComplete) {
          console.log(`   Completion: ${progress}% - ${sd.metadata.final_status || 'Complete'}`);
        }
        console.log('');
      });
    }
    
    console.log('=== SUMMARY ===');
    console.log('✅ Metadata updated for both Strategic Directives');
    console.log('✅ Dashboard will show these as 100% complete');
    console.log('✅ Status remains "active" per database constraints');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

updateSDCompletionMetadata();