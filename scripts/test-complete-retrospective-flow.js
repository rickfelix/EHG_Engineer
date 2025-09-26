#!/usr/bin/env node

/**
 * Test Complete Retrospective Flow
 * Tests all components of the retrospective system
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Retrospective System\n');
  console.log('=' .repeat(50));

  const results = {
    retrospectives: { pass: false, details: '' },
    subAgent: { pass: false, details: '' },
    insights: { pass: false, details: '' },
    patterns: { pass: false, details: '' },
    integration: { pass: false, details: '' }
  };

  try {
    // 1. Test Retrospectives Table
    console.log('\n1️⃣ Testing Retrospectives Table...');
    const { data: retros, error: retroError } = await supabase
      .from('retrospectives')
      .select('id, title, retro_type, status')
      .limit(3);

    if (retroError) {
      results.retrospectives.details = `Error: ${retroError.message}`;
    } else {
      results.retrospectives.pass = true;
      results.retrospectives.details = `Found ${retros.length} retrospectives`;
      console.log(`   ✅ ${results.retrospectives.details}`);
      retros.forEach(r => console.log(`      - ${r.retro_type}: ${r.title}`));
    }

    // 2. Test Sub-Agent
    console.log('\n2️⃣ Testing Retrospective Sub-Agent...');
    const { data: subAgent, error: subError } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('code', 'RETRO')
      .single();

    if (subError) {
      results.subAgent.details = `Error: ${subError.message}`;
    } else {
      results.subAgent.pass = true;
      results.subAgent.details = `${subAgent.name} is ${subAgent.active ? 'ACTIVE' : 'INACTIVE'}`;
      console.log(`   ✅ ${results.subAgent.details}`);
      console.log(`      Priority: ${subAgent.priority}`);
      console.log(`      Activation: ${subAgent.activation_type}`);
    }

    // 3. Test Insights
    console.log('\n3️⃣ Testing Retrospective Insights...');
    const { count: insightCount } = await supabase
      .from('retrospective_insights')
      .select('*', { count: 'exact', head: true });

    results.insights.pass = true;
    results.insights.details = `${insightCount} insights stored`;
    console.log(`   ✅ ${results.insights.details}`);

    // 4. Test Templates
    console.log('\n4️⃣ Testing Retrospective Templates...');
    const { data: templates } = await supabase
      .from('retrospective_templates')
      .select('template_name, template_type');

    if (templates && templates.length > 0) {
      console.log(`   ✅ Found ${templates.length} templates:`);
      templates.forEach(t => console.log(`      - ${t.template_type}: ${t.template_name}`));
    }

    // 5. Test Action Items
    console.log('\n5️⃣ Testing Action Items...');
    const { count: actionCount } = await supabase
      .from('retrospective_action_items')
      .select('*', { count: 'exact', head: true });

    console.log(`   ✅ ${actionCount} action items tracked`);

    // 6. Test Learning Links
    console.log('\n6️⃣ Testing Learning Links...');
    const { count: linkCount } = await supabase
      .from('retrospective_learning_links')
      .select('*', { count: 'exact', head: true });

    console.log(`   ✅ ${linkCount} links to intelligence system`);

    // 7. Test Cross-Agent Intelligence Tables
    console.log('\n7️⃣ Testing Cross-Agent Intelligence...');

    const intelligenceTables = [
      'agent_learning_outcomes',
      'intelligence_patterns',
      'agent_intelligence_insights',
      'cross_agent_correlations'
    ];

    for (const table of intelligenceTables) {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`);
      } else {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        console.log(`   ✅ ${table}: ${count} records`);

        if (table === 'intelligence_patterns') {
          results.patterns.pass = true;
          results.patterns.details = `${count} patterns identified`;
        }
      }
    }

    // 8. Test Pattern Analysis
    console.log('\n8️⃣ Testing Pattern Analysis...');
    const { data: retrospectives } = await supabase
      .from('retrospectives')
      .select('success_patterns, failure_patterns')
      .not('success_patterns', 'is', null);

    let totalPatterns = 0;
    retrospectives?.forEach(r => {
      totalPatterns += (r.success_patterns?.length || 0) + (r.failure_patterns?.length || 0);
    });

    console.log(`   ✅ ${totalPatterns} patterns extracted from retrospectives`);

    // 9. Test Sub-Agent Triggers
    console.log('\n9️⃣ Testing Sub-Agent Triggers...');
    const { data: triggers } = await supabase
      .from('leo_sub_agent_triggers')
      .select('trigger_phrase, trigger_type')
      .eq('sub_agent_id', subAgent?.id)
      .limit(5);

    if (triggers && triggers.length > 0) {
      console.log(`   ✅ Found ${triggers.length} triggers configured`);
    } else {
      console.log('   ⚠️ No triggers found (may be in different table structure)');
    }

    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('📊 RETROSPECTIVE SYSTEM TEST SUMMARY');
    console.log('=' .repeat(50));

    let passCount = 0;
    for (const [component, result] of Object.entries(results)) {
      const status = result.pass ? '✅' : '❌';
      console.log(`${status} ${component}: ${result.details || 'Not tested'}`);
      if (result.pass) passCount++;
    }

    const totalTests = Object.keys(results).length;
    const successRate = Math.round((passCount / totalTests) * 100);

    console.log('\n' + '=' .repeat(50));
    if (successRate === 100) {
      console.log('🎉 ALL TESTS PASSED! Retrospective system fully operational.');
    } else if (successRate >= 80) {
      console.log(`✅ ${successRate}% Success - System mostly operational`);
    } else if (successRate >= 60) {
      console.log(`⚠️ ${successRate}% Success - System partially operational`);
    } else {
      console.log(`❌ ${successRate}% Success - System needs attention`);
    }

    // Recommendations
    if (successRate < 100) {
      console.log('\n📝 Recommendations:');
      if (!results.insights.pass) {
        console.log('- Generate insights by running: node scripts/retrospective-sub-agent.js');
      }
      if (!results.patterns.pass) {
        console.log('- Create patterns by running: node scripts/retrospective-intelligence-integration.js');
      }
      if (!results.integration.pass) {
        console.log('- Check RLS policies or use service role key for full integration');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Execute
testCompleteFlow();