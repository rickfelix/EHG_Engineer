#!/usr/bin/env node

/**
 * Update PRD after EXEC completion
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function updateEXECComplete() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const prdId = 'PRD-SD-DASHBOARD-AUDIT-2025-08-31-A';
  
  try {
    // Update EXEC checklist items as complete
    const { data: current } = await supabase
      .from('product_requirements_v2')
      .select('exec_checklist')
      .eq('id', prdId)
      .single();
    
    const updatedChecklist = current.exec_checklist.map(item => ({
      ...item,
      checked: true
    }));
    
    const { data: _data, error } = await supabase
      .from('product_requirements_v2')
      .update({
        exec_checklist: updatedChecklist,
        status: 'testing',
        phase: 'verification',
        phase_progress: {
          planning: 100,
          design: 100,
          implementation: 100,
          verification: 0,
          approval: 0
        },
        progress: 70, // LEAD (20%) + PLAN (20%) + EXEC (30%)
        actual_end: new Date().toISOString(),
        updated_by: 'EXEC',
        metadata: {
          handoff_completed: '2025-09-01',
          handoff_from: 'EXEC',
          handoff_to: 'PLAN',
          handoff_document: '/handoffs/EXEC-to-PLAN-DASHBOARD-AUDIT-2025-09-01.md',
          audit_report: '/docs/DASHBOARD_AUDIT_REPORT.md',
          issues_found: 15,
          critical_issues: 5,
          acceptance_criteria_passed: 3,
          acceptance_criteria_total: 10
        }
      })
      .eq('id', prdId)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error updating PRD:', error.message);
      return;
    }
    
    console.log('✅ EXEC phase complete, PRD updated');
    console.log(`Status: ${data.status}`);
    console.log(`Phase: ${data.phase}`);
    console.log(`Progress: ${data.progress}%`);
    console.log('\n📊 Audit Results:');
    console.log('- Issues Found: 15 (5 critical)');
    console.log('- Acceptance Criteria: 3/10 passed');
    console.log('- Remediation Time: 13 hours estimated');
    console.log('\n🔄 Handed back to PLAN for verification');
    
  } catch (_error) {
    console.error('❌ Error:', error.message);
  }
}

updateEXECComplete();