import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-GITHUB-ACTIONS-FIX-001')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 STRATEGIC DIRECTIVE: SD-GITHUB-ACTIONS-FIX-001');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n🎯 OVERVIEW');
console.log('   ID:', sd.id);
console.log('   Title:', sd.title);
console.log('   Priority:', sd.priority.toUpperCase(), '(P0 - HIGHEST PRIORITY)');
console.log('   Status:', sd.status);
console.log('   Current Phase:', sd.current_phase);
console.log('   Category:', sd.category);
console.log('   Target Application:', sd.target_application);
console.log('   Created:', new Date(sd.created_at).toLocaleString());

console.log('\n📝 DESCRIPTION');
console.log('  ', sd.description);

console.log('\n💡 RATIONALE');
console.log(sd.rationale.split('\n').map(line => '   ' + line).join('\n'));

console.log('\n🎯 SCOPE');
console.log(sd.scope.split('\n').map(line => '   ' + line).join('\n'));

console.log('\n🎖️ STRATEGIC INTENT');
console.log(sd.strategic_intent.split('\n').map(line => '   ' + line).join('\n'));

console.log('\n✅ SUCCESS CRITERIA (' + sd.success_criteria.length + ' items)');
sd.success_criteria.forEach((sc, idx) => {
  console.log(`   ${idx + 1}. [${sc.priority}] ${sc.criterion}`);
  console.log(`      Measure: ${sc.measure}`);
});

console.log('\n⚠️  RISKS (' + sd.risks.length + ' items)');
sd.risks.forEach((risk, idx) => {
  console.log(`   ${idx + 1}. ${risk.risk}`);
  console.log(`      Severity: ${risk.severity.toUpperCase()} | Probability: ${risk.probability.toUpperCase()}`);
  console.log(`      Mitigation: ${risk.mitigation}`);
  console.log(`      Owner: ${risk.owner}`);
});

console.log('\n🔗 DEPENDENCIES (' + sd.dependencies.length + ' items)');
sd.dependencies.forEach((dep, idx) => {
  console.log(`   ${idx + 1}. ${dep.dependency}`);
  console.log(`      Type: ${dep.type} | Status: ${dep.status}`);
  console.log(`      Notes: ${dep.notes}`);
});

console.log('\n👥 STAKEHOLDERS (' + sd.stakeholders.length + ' items)');
sd.stakeholders.forEach((stakeholder, idx) => {
  console.log(`   ${idx + 1}. ${stakeholder.name} - ${stakeholder.role}`);
  console.log(`      Involvement: ${stakeholder.involvement}`);
});

console.log('\n📊 SUCCESS METRICS');
console.log('   Implementation Timeline:');
Object.entries(sd.success_metrics.implementation).forEach(([key, value]) => {
  console.log(`      ${key}: ${value}`);
});
console.log('\n   Quality Metrics:');
Object.entries(sd.success_metrics.quality).forEach(([key, value]) => {
  console.log(`      ${key}: ${value}`);
});
console.log('\n   Impact Metrics:');
Object.entries(sd.success_metrics.impact).forEach(([key, value]) => {
  console.log(`      ${key}: ${value}`);
});
console.log('\n   Business Metrics:');
Object.entries(sd.success_metrics.business).forEach(([key, value]) => {
  console.log(`      ${key}: ${value}`);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 NEXT STEPS (LEO Protocol LEAD Phase)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n1. LEAD Agent Review (6-Question Strategic Validation Gate):');
console.log('   ❓ Is this solving a real problem?');
console.log('   ❓ Is the proposed solution feasible?');
console.log('   ❓ Are resources (time, people, budget) available?');
console.log('   ❓ Does this align with strategic objectives?');
console.log('   ❓ Are we building the simplest solution?');
console.log('   ❓ What could go wrong and how do we mitigate it?');
console.log('\n2. Upon LEAD approval:');
console.log('   UPDATE strategic_directives_v2');
console.log('   SET status = \'active\', current_phase = \'PLAN\'');
console.log('   WHERE id = \'SD-GITHUB-ACTIONS-FIX-001\';');
console.log('\n3. PLAN Agent: Create comprehensive PRD');
console.log('4. EXEC Agent: Implement fixes across all 6 workflows');
console.log('5. GITHUB Sub-Agent: Validate all workflows passing');
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎯 PRIORITY RANKING: #1 in queue (P0 - CRITICAL)');
console.log('⏱️  ESTIMATED TIMELINE: 1 sprint (2 weeks, 40 hours)');
console.log('🚫 BLOCKING: All SDs requiring GITHUB sub-agent validation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
