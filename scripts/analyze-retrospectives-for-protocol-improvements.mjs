#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function analyzeRetrospectives() {
  console.log('🔍 Analyzing Retrospectives for Protocol Improvements\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get all retrospectives
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching retrospectives:', error);
    process.exit(1);
  }

  console.log(`📊 Total Retrospectives Found: ${retrospectives.length}\n`);

  // Analyze each retrospective
  const allSuccessStories = [];
  const allPainPoints = [];
  const allProcessImprovements = [];
  const allTestingLearnings = [];
  const allSubAgentRecommendations = [];

  retrospectives.forEach(retro => {
    console.log(`\n📋 SD: ${retro.sd_id} (Status: ${retro.sd_status})`);
    console.log(`   Created: ${new Date(retro.created_at).toLocaleDateString()}`);

    if (retro.success_stories?.length > 0) {
      console.log(`   ✅ Success Stories: ${retro.success_stories.length}`);
      retro.success_stories.forEach(story => {
        allSuccessStories.push({ sd: retro.sd_id, ...story });
        if (story.pattern) console.log(`      - ${story.pattern}`);
      });
    }

    if (retro.pain_points?.length > 0) {
      console.log(`   ⚠️  Pain Points: ${retro.pain_points.length}`);
      retro.pain_points.forEach(pain => {
        allPainPoints.push({ sd: retro.sd_id, ...pain });
        if (pain.description) console.log(`      - ${pain.description}`);
      });
    }

    if (retro.process_improvements?.length > 0) {
      console.log(`   🔧 Process Improvements: ${retro.process_improvements.length}`);
      retro.process_improvements.forEach(improvement => {
        allProcessImprovements.push({ sd: retro.sd_id, ...improvement });
        if (improvement.recommendation) console.log(`      - ${improvement.recommendation}`);
      });
    }

    if (retro.testing_learnings?.length > 0) {
      console.log(`   🧪 Testing Learnings: ${retro.testing_learnings.length}`);
      retro.testing_learnings.forEach(learning => {
        allTestingLearnings.push({ sd: retro.sd_id, ...learning });
      });
    }

    if (retro.sub_agent_recommendations?.length > 0) {
      console.log(`   🤖 Sub-Agent Recommendations: ${retro.sub_agent_recommendations.length}`);
      retro.sub_agent_recommendations.forEach(rec => {
        allSubAgentRecommendations.push({ sd: retro.sd_id, ...rec });
      });
    }
  });

  // Pattern Analysis
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📊 PATTERN ANALYSIS\n');

  // Success Pattern Frequency
  const successPatterns = {};
  allSuccessStories.forEach(story => {
    const pattern = story.pattern || 'Unspecified';
    successPatterns[pattern] = (successPatterns[pattern] || 0) + 1;
  });

  console.log('✅ Top Success Patterns:');
  Object.entries(successPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([pattern, count]) => {
      console.log(`   ${count}x - ${pattern}`);
    });

  // Pain Point Frequency
  const painCategories = {};
  allPainPoints.forEach(pain => {
    const category = pain.category || 'Unspecified';
    painCategories[category] = (painCategories[category] || 0) + 1;
  });

  console.log('\n⚠️  Top Pain Point Categories:');
  Object.entries(painCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([category, count]) => {
      console.log(`   ${count}x - ${category}`);
    });

  // Critical Lessons Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('🎯 CRITICAL LESSONS FOR PROTOCOL IMPROVEMENT\n');

  // Find high-impact process improvements
  const highImpactImprovements = allProcessImprovements.filter(imp =>
    imp.impact === 'high' || imp.priority === 'high'
  );

  console.log(`📈 High-Impact Process Improvements (${highImpactImprovements.length}):\n`);
  highImpactImprovements.forEach((imp, idx) => {
    console.log(`${idx + 1}. [${imp.sd}] ${imp.recommendation}`);
    if (imp.implementation) console.log(`   Implementation: ${imp.implementation}`);
    console.log('');
  });

  // Sub-Agent Enhancement Recommendations
  const subAgentEnhancements = allSubAgentRecommendations.filter(rec =>
    rec.priority === 'high' || rec.action === 'enhance'
  );

  console.log(`\n🤖 Sub-Agent Enhancement Recommendations (${subAgentEnhancements.length}):\n`);
  subAgentEnhancements.forEach((rec, idx) => {
    console.log(`${idx + 1}. Sub-Agent: ${rec.sub_agent_name || 'Unknown'}`);
    console.log(`   Action: ${rec.action}`);
    console.log(`   Reason: ${rec.reason || 'Not specified'}`);
    console.log('');
  });

  // Testing Infrastructure Gaps
  console.log('\n🧪 Testing Infrastructure Learnings:\n');
  allTestingLearnings.forEach((learning, idx) => {
    console.log(`${idx + 1}. [${learning.sd}]`);
    if (learning.what_worked) console.log(`   ✅ Worked: ${learning.what_worked}`);
    if (learning.what_failed) console.log(`   ❌ Failed: ${learning.what_failed}`);
    if (learning.recommendation) console.log(`   💡 Recommendation: ${learning.recommendation}`);
    console.log('');
  });

  // Recurring Pain Points
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔴 RECURRING PAIN POINTS (Needs Immediate Protocol Update)\n');

  const painDescriptions = allPainPoints.map(p => p.description?.toLowerCase() || '');
  const recurringThemes = [
    'database',
    'migration',
    'testing',
    'authentication',
    'verification',
    'documentation',
    'handoff',
    'scope'
  ];

  recurringThemes.forEach(theme => {
    const count = painDescriptions.filter(desc => desc.includes(theme)).length;
    if (count >= 2) {
      console.log(`⚠️  "${theme}" mentioned in ${count} retrospectives`);
      const examples = allPainPoints.filter(p =>
        p.description?.toLowerCase().includes(theme)
      ).slice(0, 3);
      examples.forEach(ex => {
        console.log(`   - [${ex.sd}] ${ex.description}`);
      });
      console.log('');
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Analysis Complete\n');
}

analyzeRetrospectives();
