import { fileURLToPath } from 'url';
import { dirname } from 'path';




import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import ProgressCalculator from '../lib/dashboard/progress-calculator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function debugProgressCalculator() {
  try {
    console.log('\n=== DEBUGGING PROGRESS CALCULATOR ===\n');
    
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
    
    console.log('📊 DATABASE STATE:');
    console.log(`SD metadata completion_percentage: ${sd.metadata?.completion_percentage}`);
    console.log(`PRD approved_by: ${prd.approved_by}`);
    console.log(`PRD approval_date: ${prd.approval_date}`);
    console.log(`PRD status: ${prd.status}\n`);
    
    // Test the progress calculator
    const calculator = new ProgressCalculator();
    const progressData = calculator.calculateSDProgress(sd, prd);
    
    console.log('🔍 PROGRESS CALCULATOR RESULTS:');
    console.log(`Total Progress: ${progressData.total}%`);
    console.log(`Current Phase: ${progressData.currentPhase}`);
    console.log('\n📋 PHASE BREAKDOWN:');
    Object.entries(progressData.phases).forEach(([phase, percentage]) => {
      console.log(`  ${phase}: ${percentage}%`);
    });
    
    console.log('\n🔍 DETAILED ANALYSIS:');
    console.log('LEAD Planning:', calculator.calculateLeadPlanningProgress(sd));
    console.log('PLAN Design:', calculator.calculatePlanDesignProgress(prd));
    console.log('EXEC Implementation:', calculator.calculateExecImplementationProgress(prd));
    console.log('PLAN Verification:', calculator.calculatePlanVerificationProgress(prd));
    console.log('LEAD Approval:', calculator.calculateLeadApprovalProgress(prd));
    
    console.log('\n🎯 EXPECTED vs ACTUAL:');
    console.log('Expected: 100% (all phases complete)');
    console.log(`Actual: ${progressData.total}%`);
    console.log(`Match: ${progressData.total === 100 ? '✅ YES' : '❌ NO'}`);
    
    // Test individual approval conditions
    console.log('\n🔍 APPROVAL CONDITIONS TEST:');
    console.log(`approved_by === 'LEAD': ${prd.approved_by === 'LEAD'}`);
    console.log(`approval_date exists: ${!!prd.approval_date}`);
    console.log(`status === 'approved': ${prd.status === 'approved'}`);
    
    if (progressData.total !== 100) {
      console.log('\n⚠️  POTENTIAL ISSUE FOUND:');
      console.log('The progress calculator should return 100% but is not.');
      console.log('This suggests a logic issue in the calculation.');
    }

  } catch (err) {
    console.error('❌ Debug failed:', err.message);
  }
}

debugProgressCalculator();