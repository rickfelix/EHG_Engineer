const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFields() {
  console.log('=== Analyzing success_metrics vs success_criteria ===\n');

  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, success_metrics, success_criteria')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('📊 Field Analysis for SD-VIDEO-VARIANT-001:\n');
  
  console.log('1. success_metrics (Quantitative KPIs):');
  if (sd.success_metrics && Array.isArray(sd.success_metrics)) {
    console.log(`   Count: ${sd.success_metrics.length} items`);
    sd.success_metrics.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.metric || m}`);
      if (m.target) console.log(`      Target: ${m.target}`);
    });
  } else {
    console.log('   Empty or not set');
  }
  console.log('');

  console.log('2. success_criteria (Qualitative Acceptance Criteria):');
  if (sd.success_criteria && Array.isArray(sd.success_criteria)) {
    console.log(`   Count: ${sd.success_criteria.length} items`);
    sd.success_criteria.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c}`);
    });
  } else {
    console.log('   Empty or not set');
  }
  console.log('');

  console.log('─── ANALYSIS ───\n');
  console.log('Intended Purpose:');
  console.log('• success_metrics: QUANTITATIVE - Measurable KPIs with targets');
  console.log('  Example: "80% test coverage", ">70% statistical confidence"');
  console.log('  Structure: { metric, target, measurement }');
  console.log('');
  console.log('• success_criteria: QUALITATIVE - Acceptance criteria for "done"');
  console.log('  Example: "Users can generate variants", "Component sizing maintained"');
  console.log('  Structure: Simple string array');
  console.log('');

  // Check if there's overlap
  let overlap = false;
  if (sd.success_metrics && sd.success_criteria) {
    console.log('🔍 Checking for Duplication:\n');
    
    const metricsText = JSON.stringify(sd.success_metrics).toLowerCase();
    const criteriaText = JSON.stringify(sd.success_criteria).toLowerCase();
    
    // Simple overlap detection
    const metricKeywords = metricsText.split(/\W+/);
    const criteriaKeywords = criteriaText.split(/\W+/);
    
    const commonKeywords = metricKeywords.filter(k => 
      k.length > 4 && criteriaKeywords.includes(k)
    );
    
    if (commonKeywords.length > 3) {
      overlap = true;
      console.log('⚠️  POTENTIAL DUPLICATION DETECTED');
      console.log(`   Common concepts: ${commonKeywords.slice(0, 5).join(', ')}`);
      console.log('');
    }
  }

  console.log('─── RECOMMENDATION ───\n');
  
  if (overlap) {
    console.log('🎯 ACTION REQUIRED: Consolidate fields to avoid confusion');
    console.log('');
    console.log('Option A: Keep success_metrics only (RECOMMENDED)');
    console.log('  • More structured (includes targets & measurements)');
    console.log('  • Validator requires it (line 227 in verify-handoff-lead-to-plan.js)');
    console.log('  • Can serve both quantitative and qualitative purposes');
    console.log('  • Remove success_criteria field');
    console.log('');
    console.log('Option B: Keep both but differentiate clearly');
    console.log('  • success_metrics = MEASURABLE KPIs only (with numbers)');
    console.log('  • success_criteria = QUALITATIVE done criteria (no numbers)');
    console.log('  • Update population scripts to avoid overlap');
    console.log('');
  } else {
    console.log('✅ NO DUPLICATION DETECTED');
    console.log('   Fields serve complementary purposes');
    console.log('   Keep both as-is');
  }
}

checkFields();
