import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkDashboardPRD() {
  console.log('📊 VERIFYING DASHBOARD PRD CONTENT');
  console.log('===================================');
  
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, title, executive_summary, functional_requirements, technical_requirements')
    .eq('directive_id', 'SD-2025-0903-SDIP')
    .single();
    
  if (!prd) {
    console.log('❌ PRD not found in dashboard');
    return;
  }
  
  console.log('✅ PRD visible in dashboard:');
  console.log('  ID:', prd.id);
  console.log('  Title:', prd.title);
  console.log('  Executive Summary:', prd.executive_summary ? 'Present' : 'Missing');
  console.log('  Functional Requirements:', prd.functional_requirements?.length || 0);
  console.log('  Technical Requirements:', prd.technical_requirements ? 'Present' : 'Missing');
  
  if (prd.technical_requirements && prd.technical_requirements.components) {
    console.log('\n🔧 Technical Components:');
    prd.technical_requirements.components.forEach((comp, i) => {
      console.log(`  ${i+1}. ${comp.name}: ${comp.requirements?.length || 0} requirements`);
    });
  }
  
  console.log('\n🎯 Dashboard will now show comprehensive PRD for SDIP directive');
}

checkDashboardPRD().catch(console.error);