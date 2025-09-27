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

async function testProgressCalculation() {
  try {
    console.log('\n=== TESTING PROGRESS CALCULATION ===\n');
    
    // Get current data
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-DASHBOARD-UI-2025-08-31-A')
      .single();
      
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', 'PRD-SD-DASHBOARD-UI-2025-08-31-A')
      .single();
    
    console.log('📊 DATABASE VALUES:');
    console.log(`SD metadata.completion_percentage: ${sd.metadata?.completion_percentage}`);
    console.log(`SD metadata.current_phase: ${sd.metadata?.current_phase}`);
    
    console.log('\n📋 PHASE PROGRESS:');
    if (sd.metadata?.phase_progress) {
      Object.entries(sd.metadata.phase_progress).forEach(([phase, progress]) => {
        console.log(`  ${phase}: ${progress}%`);
      });
    }
    
    console.log('\n🔍 CALCULATION LOGIC:');
    
    // Manual calculation following LEO Protocol v4.1
    const phases = {
      LEAD_PLANNING: 20,
      PLAN_DESIGN: 20,
      EXEC_IMPLEMENTATION: 30,
      PLAN_VERIFICATION: 15,
      LEAD_APPROVAL: 15
    };
    
    let calculatedProgress = 0;
    
    // LEAD Planning (20%)
    const isPlaceholder = sd.title === '[Enter Strategic Directive Title]' || !sd.title || sd.status === 'draft';
    if (!isPlaceholder) {
      calculatedProgress += phases.LEAD_PLANNING;
      console.log(`✅ LEAD Planning: +${phases.LEAD_PLANNING}% (Total: ${calculatedProgress}%)`);
    }
    
    // PLAN Design (20%)
    const planItems = prd.plan_checklist || [];
    const planComplete = planItems.filter(i => i.checked).length;
    const planTotal = planItems.length || 1;
    const planProgress = (planComplete / planTotal) * phases.PLAN_DESIGN;
    calculatedProgress += planProgress;
    console.log(`✅ PLAN Design: +${planProgress.toFixed(1)}% (${planComplete}/${planTotal} complete) (Total: ${calculatedProgress.toFixed(1)}%)`);
    
    // EXEC Implementation (30%)
    const execItems = prd.exec_checklist || [];
    const execComplete = execItems.filter(i => i.checked).length;
    const execTotal = execItems.length || 1;
    const execProgress = (execComplete / execTotal) * phases.EXEC_IMPLEMENTATION;
    calculatedProgress += execProgress;
    console.log(`✅ EXEC Implementation: +${execProgress.toFixed(1)}% (${execComplete}/${execTotal} complete) (Total: ${calculatedProgress.toFixed(1)}%)`);
    
    // PLAN Verification (15%)
    let validationItems = prd.validation_checklist || [];
    if (!validationItems.length && prd.metadata?.verification_checklist) {
      validationItems = prd.metadata.verification_checklist;
    }
    const validationComplete = validationItems.filter(i => i.checked).length;
    const validationTotal = validationItems.length || 1;
    const validationProgress = (validationComplete / validationTotal) * phases.PLAN_VERIFICATION;
    calculatedProgress += validationProgress;
    console.log(`✅ PLAN Verification: +${validationProgress.toFixed(1)}% (${validationComplete}/${validationTotal} complete) (Total: ${calculatedProgress.toFixed(1)}%)`);
    
    // LEAD Approval (15%)
    if (prd.approved_by === 'LEAD' && prd.approval_date) {
      calculatedProgress += phases.LEAD_APPROVAL;
      console.log(`✅ LEAD Approval: +${phases.LEAD_APPROVAL}% (Total: ${calculatedProgress}%)`);
    } else {
      console.log(`⏳ LEAD Approval: +0% (not approved yet) (Total: ${calculatedProgress.toFixed(1)}%)`);
    }
    
    console.log('\n🎯 RESULTS:');
    console.log(`Database stored progress: ${sd.metadata?.completion_percentage}%`);
    console.log(`Calculated progress: ${Math.round(calculatedProgress)}%`);
    console.log(`Match: ${sd.metadata?.completion_percentage === Math.round(calculatedProgress) ? '✅ YES' : '❌ NO'}`);
    
    if (sd.metadata?.completion_percentage !== Math.round(calculatedProgress)) {
      console.log('\n🔧 DISCREPANCY ANALYSIS:');
      console.log('The database-loader.js should prioritize metadata.completion_percentage');
      console.log('when available, which handles complex phase transitions correctly.');
    }
    
  } catch (err) {
    console.error('❌ Error testing progress:', err.message);
  }
}

testProgressCalculation();