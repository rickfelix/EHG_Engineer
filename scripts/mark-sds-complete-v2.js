// Unused ES module path helpers (kept for potential future use)
// import { fileURLToPath } from 'url';
// import { dirname } from 'path';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function markSDsComplete() {
  try {
    console.log('\n=== MARKING STRATEGIC DIRECTIVES AS COMPLETE ===\n');
    
    // Try using "complete" instead of "completed"
    console.log('Testing with status = "complete"...\n');
    
    // 1. Update SD-DASHBOARD-AUDIT-2025-08-31-A
    console.log('Updating SD-DASHBOARD-AUDIT-2025-08-31-A...');
    const { error: sd1Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        status: 'complete',  // Try "complete" instead of "completed"
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
      .select();
    
    if (sd1Error) {
      console.error('  Error with "complete":', sd1Error.message);
      
      // Try "approved" as fallback
      console.log('  Trying with status = "approved"...');
      const { error: sd1bError } = await supabase
        .from('strategic_directives_v2')
        .update({ 
          status: 'approved',
          updated_at: new Date().toISOString()
        })
        .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A')
        .select();
      
      if (sd1bError) {
        console.error('  Error with "approved":', sd1bError.message);
      } else {
        console.log('  ✓ SD-DASHBOARD-AUDIT-2025-08-31-A marked as approved');
      }
    } else {
      console.log('  ✓ SD-DASHBOARD-AUDIT-2025-08-31-A marked as complete');
    }
    
    // 2. Update SD-2025-01-15-A
    console.log('\nUpdating SD-2025-01-15-A...');
    const { error: sd2Error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        status: 'complete',  // Try "complete" instead of "completed"
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-2025-01-15-A')
      .select();
    
    if (sd2Error) {
      console.error('  Error with "complete":', sd2Error.message);
      
      // Try "approved" as fallback
      console.log('  Trying with status = "approved"...');
      const { error: sd2bError } = await supabase
        .from('strategic_directives_v2')
        .update({ 
          status: 'approved',
          updated_at: new Date().toISOString()
        })
        .eq('id', 'SD-2025-01-15-A')
        .select();
      
      if (sd2bError) {
        console.error('  Error with "approved":', sd2bError.message);
      } else {
        console.log('  ✓ SD-2025-01-15-A marked as approved');
      }
    } else {
      console.log('  ✓ SD-2025-01-15-A marked as complete');
    }
    
    // Verify the updates
    console.log('\n=== VERIFICATION ===');
    const { data: verifyData } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .order('created_at', { ascending: false });
    
    if (verifyData) {
      console.log('\nCurrent SD statuses:');
      verifyData.forEach(sd => {
        const statusIcon = sd.status === 'complete' ? '✅' : 
                          sd.status === 'approved' ? '✅' :
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