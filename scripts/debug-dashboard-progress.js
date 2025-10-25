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

async function debugDashboardProgress() {
  try {
    console.log('\n=== DEBUGGING DASHBOARD PROGRESS DISCREPANCIES ===\n');
    
    // Get dashboard API data
    const dashboardResponse = await fetch('http://localhost:3000/api/state');
    const dashboardData = await dashboardResponse.json();
    
    console.log('📊 DASHBOARD SHOWING:');
    dashboardData.strategicDirectives.forEach(sd => {
      console.log(`  ${sd.id}: ${sd.progress}% (${sd.status})`);
    });
    
    console.log('\n🔍 DATABASE ANALYSIS:');
    
    // Get all SDs from database directly
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .order('created_at', { ascending: false });
    
    const { data: prds } = await supabase
      .from('product_requirements_v2')
      .select('*');
    
    const prdMap = {};
    prds?.forEach(prd => {
      prdMap[prd.directive_id] = prd;
    });
    
    const calculator = new ProgressCalculator();
    
    console.log('\nSD-by-SD Analysis:');
    
    for (const sd of sds) {
      const prd = prdMap[sd.id];
      const dashboardSD = dashboardData.strategicDirectives.find(d => d.id === sd.id);
      
      console.log(`\\n📋 ${sd.id}:`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  DB Status: ${sd.status}`);
      console.log(`  DB metadata completion_percentage: ${sd.metadata?.completion_percentage}`);
      
      // Calculate what progress should be
      const calculatedProgress = calculator.calculateSDProgress(sd, prd);
      
      console.log(`  Dashboard showing: ${dashboardSD?.progress}%`);
      console.log(`  Calculator result: ${calculatedProgress.total}%`);
      console.log(`  Match: ${dashboardSD?.progress === calculatedProgress.total ? '✅ YES' : '❌ NO'}`);
      
      if (dashboardSD?.progress !== calculatedProgress.total) {
        console.log(`  🔍 DISCREPANCY ANALYSIS:`);
        console.log(`    Phase breakdown: ${JSON.stringify(calculatedProgress.phases)}`);
        console.log(`    Current phase: ${calculatedProgress.currentPhase}`);
        console.log(`    PRD exists: ${!!prd}`);
        console.log(`    PRD status: ${prd?.status}`);
        console.log(`    PRD approved_by: ${prd?.approved_by}`);
        console.log(`    PRD approval_date: ${prd?.approval_date}`);
        
        // Check if it's using metadata override
        if (sd.metadata?.completion_percentage !== undefined) {
          console.log(`    Using metadata override: ${sd.metadata.completion_percentage}%`);
        }
        
        // Check checklist completion
        if (prd) {
          const planComplete = (prd.plan_checklist || []).filter(i => i.checked).length;
          const planTotal = (prd.plan_checklist || []).length;
          const execComplete = (prd.exec_checklist || []).filter(i => i.checked).length;
          const execTotal = (prd.exec_checklist || []).length;
          
          console.log(`    PLAN checklist: ${planComplete}/${planTotal} complete`);
          console.log(`    EXEC checklist: ${execComplete}/${execTotal} complete`);
        }
      }
    }
    
    console.log('\\n🎯 POTENTIAL ISSUES:');
    console.log('  1. Database-loader.js may have caching issues');
    console.log('  2. Progress calculator logic may need updates');
    console.log('  3. Real-time sync may not be triggering recalculation');
    console.log('  4. Metadata completion_percentage may be overriding calculation');

  } catch (err) {
    console.error('❌ Debug failed:', err.message);
  }
}

debugDashboardProgress();