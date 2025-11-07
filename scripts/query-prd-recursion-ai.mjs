import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: prd, error } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-RECURSION-AI-001')
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log('📋 PRD-RECURSION-AI-001\n');
console.log('Title:', prd.title);
console.log('Status:', prd.status);
console.log('Priority:', prd.priority);
console.log('\n🎯 Functional Requirements:', prd.functional_requirements?.length || 0);
console.log('🎯 Technical Requirements:', prd.technical_requirements?.length || 0);
console.log('✅ Acceptance Criteria:', prd.acceptance_criteria?.length || 0);
console.log('🧪 Test Scenarios:', prd.test_scenarios?.length || 0);
console.log('⚠️ Risks:', prd.risks?.length || 0);

console.log('\n📦 Functional Requirements:');
prd.functional_requirements?.forEach((fr, i) => {
  console.log(`\n${i + 1}. ${fr.id}: ${fr.requirement}`);
  console.log(`   Priority: ${fr.priority}`);
});

console.log('\n🏗️ Implementation Approach (first 800 chars):');
console.log(prd.implementation_approach?.substring(0, 800));
