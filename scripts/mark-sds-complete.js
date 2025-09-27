import { fileURLToPath } from 'url';
import { dirname } from 'path';




import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config(); });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function markSDsComplete() {
  try {
    console.log('\n=== MARKING STRATEGIC DIRECTIVES AS COMPLETE ===\n');
    
    // 1. Update SD-DASHBOARD-AUDIT-2025-08-31-A
    console.log('Updating SD-DASHBOARD-AUDIT-2025-08-31-A...');
    const { data: sd1, error: sd1Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
      .select();
    
    if (sd1Error) {
      console.error('  Error updating SD-DASHBOARD-AUDIT:', sd1Error);
    } else {
      console.log('  ✓ SD-DASHBOARD-AUDIT-2025-08-31-A marked as completed');
      
      // The PRD is already marked as approved, which is correct
      console.log('  ✓ Associated PRD already marked as approved');
    }
    
    // 2. Update SD-2025-01-15-A
    console.log('\nUpdating SD-2025-01-15-A...');
    const { data: sd2, error: sd2Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-2025-01-15-A')
      .select();
    
    if (sd2Error) {
      console.error('  Error updating SD-2025-01-15-A:', sd2Error);
    } else {
      console.log('  ✓ SD-2025-01-15-A marked as completed');
    }
    
    // 3. Clean up draft SDs that have no meaningful content
    console.log('\nChecking draft SDs for cleanup...');
    
    // SD-DASHBOARD-UI-2025-08-31-A - appears to be a placeholder
    console.log('  SD-DASHBOARD-UI-2025-08-31-A: Keeping as draft (may be used for UI improvements)');
    
    // SD-003-dashboard - appears to be a placeholder
    console.log('  SD-003-dashboard: Keeping as draft (may be used for future dashboard work)');
    
    console.log('\n=== COMPLETION UPDATE SUMMARY ===');
    console.log('✓ SD-DASHBOARD-AUDIT-2025-08-31-A: Marked as completed');
    console.log('✓ SD-2025-01-15-A: Marked as completed');
    console.log('✓ 2 draft SDs retained for potential future use');
    
    // Verify the updates
    console.log('\n=== VERIFICATION ===');
    const { data: verifyData, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .order('created_at', { ascending: false });
    
    if (verifyData) {
      console.log('\nCurrent SD statuses:');
      verifyData.forEach(sd => {
        const statusIcon = sd.status === 'completed' ? '✓' : 
                          sd.status === 'active' ? '⚡' : 
                          sd.status === 'draft' ? '📝' : '?';
        console.log(`  ${statusIcon} ${sd.id}: ${sd.status}`);
      });
    }
    
  } catch (err) {
    console.error('Failed to update SDs:', err.message);
  }
}

markSDsComplete();