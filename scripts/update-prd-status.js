#!/usr/bin/env node

/**
 * Update PRD Status for Handoff
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

async function updatePRDStatus() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const prdId = 'PRD-SD-DASHBOARD-AUDIT-2025-08-31-A';
  
  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .update({
        status: 'in_progress',
        phase: 'implementation',
        phase_progress: {
          planning: 100,
          design: 100,
          implementation: 0,
          verification: 0,
          approval: 0
        },
        progress: 40, // LEAD (20%) + PLAN (20%) complete
        actual_start: new Date().toISOString(),
        updated_by: 'PLAN',
        metadata: {
          handoff_completed: '2025-09-01',
          handoff_to: 'EXEC',
          handoff_document: '/handoffs/PLAN-to-EXEC-DASHBOARD-AUDIT-2025-09-01.md'
        }
      })
      .eq('id', prdId)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error updating PRD status:', error.message);
      return;
    }
    
    console.log('✅ PRD status updated for EXEC handoff');
    console.log(`Status: ${data.status}`);
    console.log(`Phase: ${data.phase}`);
    console.log(`Progress: ${data.progress}%`);
    console.log('\n🚀 Ready for EXEC implementation!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updatePRDStatus();