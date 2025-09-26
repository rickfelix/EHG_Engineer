#!/usr/bin/env node

/**
 * Demonstrate Complete Retrospective Workflow
 * Shows how the system captures learnings and feeds them into intelligence
 */

const { createClient } = require('@supabase/supabase-js');
const RetrospectiveSubAgent = require('./retrospective-sub-agent.js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function demonstrateWorkflow() {
  console.log('🎭 RETROSPECTIVE SYSTEM WORKFLOW DEMONSTRATION\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Generate a new retrospective
    console.log('\n📝 STEP 1: Generate Sprint Retrospective');
    console.log('-'.repeat(40));

    const agent = new RetrospectiveSubAgent();
    const result = await agent.execute({
      trigger: 'demo',
      entityType: 'sprint',
      autoGenerate: true
    });

    if (result.success) {
      console.log(`✅ Created retrospective: ${result.retrospectiveId}`);

      // Get the created retrospective
      const { data: retro } = await supabase
        .from('retrospectives')
        .select('*')
        .eq('id', result.retrospectiveId)
        .single();

      console.log(`   Title: ${retro.title}`);
      console.log(`   Type: ${retro.retro_type}`);
      console.log(`   Status: ${retro.status}`);

      // Step 2: Show what went well/needs improvement
      console.log('\n📊 STEP 2: Extracted Information');
      console.log('-'.repeat(40));

      if (retro.what_went_well?.length > 0) {
        console.log('✅ What Went Well:');
        retro.what_went_well.slice(0, 3).forEach(item => {
          console.log(`   - ${item.text || item}`);
        });
      }

      if (retro.what_needs_improvement?.length > 0) {
        console.log('\n⚠️ What Needs Improvement:');
        retro.what_needs_improvement.slice(0, 3).forEach(item => {
          console.log(`   - ${item.text || item}`);
        });
      }

      // Step 3: Show patterns identified
      console.log('\n🧩 STEP 3: Patterns Identified');
      console.log('-'.repeat(40));

      if (retro.success_patterns?.length > 0) {
        console.log('✅ Success Patterns:', retro.success_patterns.join(', '));
      }

      if (retro.failure_patterns?.length > 0) {
        console.log('⚠️ Failure Patterns:', retro.failure_patterns.join(', '));
      }

      // Step 4: Check insights
      const { data: insights } = await supabase
        .from('retrospective_insights')
        .select('*')
        .eq('retrospective_id', result.retrospectiveId);

      if (insights && insights.length > 0) {
        console.log('\n💡 STEP 4: Insights Generated');
        console.log('-'.repeat(40));
        insights.forEach(insight => {
          console.log(`${insight.is_actionable ? '🎯' : '📝'} ${insight.title}`);
          console.log(`   Impact: ${insight.impact_level}`);
        });
      }

      // Step 5: Check action items
      const { data: actions } = await supabase
        .from('retrospective_action_items')
        .select('*')
        .eq('retrospective_id', result.retrospectiveId);

      if (actions && actions.length > 0) {
        console.log('\n✅ STEP 5: Action Items Created');
        console.log('-'.repeat(40));
        actions.forEach(action => {
          console.log(`- ${action.title}`);
          console.log(`  Assigned to: ${action.assigned_to}`);
          console.log(`  Priority: ${action.priority}`);
        });
      }
    }

    // Step 6: Analyze all retrospectives
    console.log('\n📈 STEP 6: Pattern Analysis Across All Retrospectives');
    console.log('-'.repeat(40));

    const analysisResult = await agent.analyzeExistingRetrospectives();
    if (analysisResult.success) {
      console.log(`Analyzed ${analysisResult.retrospectivesAnalyzed} retrospectives`);

      if (analysisResult.patterns.length > 0) {
        console.log('\nTop Patterns:');
        analysisResult.patterns.slice(0, 5).forEach(([pattern, count]) => {
          const indicator = count > 0 ? '✅' : '⚠️';
          console.log(`${indicator} ${pattern}: ${Math.abs(count)} occurrences`);
        });
      }
    }

    // Step 7: Show integration potential
    console.log('\n🔗 STEP 7: Cross-Agent Intelligence Integration');
    console.log('-'.repeat(40));

    // Check if we have learning outcomes
    const { count: outcomeCount } = await supabase
      .from('agent_learning_outcomes')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Learning Outcomes: ${outcomeCount} records`);

    // Check patterns
    const { count: patternCount } = await supabase
      .from('intelligence_patterns')
      .select('*', { count: 'exact', head: true });

    console.log(`🧩 Intelligence Patterns: ${patternCount} records`);

    // Check agent insights
    const { count: insightCount } = await supabase
      .from('agent_intelligence_insights')
      .select('*', { count: 'exact', head: true });

    console.log(`💡 Agent Insights: ${insightCount} records`);

    // Final summary
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 WORKFLOW DEMONSTRATION COMPLETE');
    console.log('=' .repeat(60));

    console.log('\n📚 Key Capabilities Demonstrated:');
    console.log('✅ Automatic retrospective generation');
    console.log('✅ Pattern extraction from experiences');
    console.log('✅ Insight generation for improvements');
    console.log('✅ Action item tracking with assignments');
    console.log('✅ Cross-retrospective pattern analysis');
    console.log('✅ Integration with agent intelligence system');

    console.log('\n🚀 Next Steps:');
    console.log('1. Retrospectives will auto-generate on sprint/SD completion');
    console.log('2. Patterns will accumulate over time for ML analysis');
    console.log('3. Agents will learn from past experiences');
    console.log('4. System will provide increasingly better recommendations');

  } catch (error) {
    console.error('❌ Demonstration failed:', error.message);
  }
}

// Execute
demonstrateWorkflow();