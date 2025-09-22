import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function validateNewPRD() {
  console.log('🎯 COMPREHENSIVE PRD VALIDATION');
  console.log('================================');
  
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', 'PRD-1756940771604')
    .single();
    
  if (!prd) {
    console.log('❌ PRD not found');
    return;
  }
  
  console.log('📋 PRD Details:');
  console.log('  Title:', prd.title);
  console.log('  Status:', prd.status);
  console.log('  Executive Summary:', prd.executive_summary ? '✅ Present' : '❌ Missing');
  console.log('  Business Context:', prd.business_context ? '✅ Present' : '❌ Missing');
  console.log('  Technical Context:', prd.technical_context ? '✅ Present' : '❌ Missing');
  
  console.log('\n📊 Content Analysis:');
  console.log('  Functional Requirements:', prd.functional_requirements?.length || 0);
  console.log('  Non-functional Requirements:', prd.non_functional_requirements?.length || 0);  
  console.log('  Technical Requirements:', prd.technical_requirements ? '✅ Comprehensive' : '❌ Missing');
  console.log('  UI/UX Requirements:', Array.isArray(prd.ui_ux_requirements) ? prd.ui_ux_requirements.length : '❌ Not array');
  console.log('  Performance Requirements:', prd.performance_requirements ? '✅ Present' : '❌ Missing');
  console.log('  Acceptance Criteria:', prd.acceptance_criteria?.length || 0);
  console.log('  Risks:', prd.risks?.length || 0);
  
  console.log('\n🎯 Quality Score:');
  let score = 0;
  let maxScore = 10;
  
  if (prd.executive_summary) score++;
  if (prd.business_context) score++;
  if (prd.technical_context) score++;
  if (prd.functional_requirements?.length > 5) score++;
  if (prd.non_functional_requirements?.length > 3) score++;
  if (prd.technical_requirements) score++;
  if (prd.performance_requirements) score++;
  if (prd.acceptance_criteria?.length > 5) score++;
  if (prd.risks?.length > 2) score++;
  if (prd.metadata?.complexity) score++;
  
  console.log('  Quality Score:', score + '/' + maxScore, '(' + Math.round(score/maxScore*100) + '%)');
  
  if (score >= 8) {
    console.log('\n🎉 EXCELLENT PRD - Professional quality achieved!');
  } else if (score >= 6) {
    console.log('\n✅ GOOD PRD - Meets standards');
  } else {
    console.log('\n⚠️  PRD needs improvement');
  }
}

validateNewPRD().catch(console.error);