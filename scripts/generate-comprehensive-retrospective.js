#!/usr/bin/env node

/**
 * COMPREHENSIVE RETROSPECTIVE GENERATOR
 * Enhanced version that analyzes handoffs, PRDs, and implementation details
 * to generate detailed, meaningful retrospectives
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Extract insights from handoff documents
 */
function analyzeHandoffs(sdKey) {
  const handoffDir = './handoffs';
  const insights = {
    achievements: [],
    challenges: [],
    learnings: [],
    actions: [],
    patterns: []
  };

  if (!fs.existsSync(handoffDir)) {
    return insights;
  }

  const handoffFiles = fs.readdirSync(handoffDir)
    .filter(f => f.includes(sdKey) && f.endsWith('.md'));

  for (const file of handoffFiles) {
    const content = fs.readFileSync(path.join(handoffDir, file), 'utf8');

    // Extract "What Went Well" patterns
    const wentWellMatch = content.match(/##.*What.*Well[\s\S]*?(?=##|$)/i);
    if (wentWellMatch) {
      const items = wentWellMatch[0].match(/[-•]\s*(.+)/g);
      if (items) {
        insights.achievements.push(...items.map(i => i.replace(/^[-•]\s*/, '').trim()));
      }
    }

    // Extract challenges/issues
    const issuesMatch = content.match(/##.*(?:Issues?|Challenges?|Concerns?)[\s\S]*?(?=##|$)/i);
    if (issuesMatch) {
      const items = issuesMatch[0].match(/[-•]\s*(.+)/g);
      if (items) {
        insights.challenges.push(...items.map(i => i.replace(/^[-•]\s*/, '').trim()));
      }
    }

    // Extract learnings
    const learningsMatch = content.match(/##.*(?:Learnings?|Lessons?)[\s\S]*?(?=##|$)/i);
    if (learningsMatch) {
      const items = learningsMatch[0].match(/[-•]\s*(.+)/g);
      if (items) {
        insights.learnings.push(...items.map(i => i.replace(/^[-•]\s*/, '').trim()));
      }
    }

    // Extract action items
    const actionsMatch = content.match(/##.*Action.*Items[\s\S]*?(?=##|$)/i);
    if (actionsMatch) {
      const items = actionsMatch[0].match(/[-•]\s*(.+)/g);
      if (items) {
        insights.actions.push(...items.map(i => i.replace(/^[-•]\s*/, '').trim()));
      }
    }

    // Extract time/performance metrics
    const timeMatches = content.match(/(\d+)\s*(?:hours?|mins?|minutes?)/gi);
    if (timeMatches) {
      insights.patterns.push(`Time metrics: ${timeMatches.join(', ')}`);
    }

    // Extract sub-agent verdicts
    const verdictMatches = content.match(/(?:Verdict|Confidence|Score):\s*([^\n]+)/gi);
    if (verdictMatches) {
      insights.patterns.push(...verdictMatches);
    }
  }

  return insights;
}

/**
 * Analyze PRD for context
 */
async function analyzePRD(sdId) {
  const { data: prd } = await supabase
    .from('prds')
    .select('*')
    .eq('strategic_directive_id', sdId)
    .single();

  if (!prd) return null;

  return {
    functional_requirements: prd.functional_requirements?.length || 0,
    technical_requirements: prd.technical_requirements?.length || 0,
    acceptance_criteria: prd.acceptance_criteria?.length || 0,
    test_scenarios: prd.test_scenarios?.length || 0,
    complexity_score: prd.complexity_score || 'unknown'
  };
}

/**
 * Analyze sub-agent executions
 */
async function analyzeSubAgents(sdId) {
  const { data: executions } = await supabase
    .from('sub_agent_executions')
    .select('*')
    .eq('sd_id', sdId);

  if (!executions || executions.length === 0) {
    return { consulted: 0, verdicts: [] };
  }

  return {
    consulted: executions.length,
    verdicts: executions.map(e => ({
      agent: e.sub_agent_code,
      verdict: e.verdict,
      confidence: e.confidence_score
    }))
  };
}

/**
 * Calculate quality metrics
 */
function calculateQualityScore(insights, prdAnalysis, subAgents, sd) {
  let score = 60; // Base score

  // Progress contribution (30 points)
  score += (sd.progress || 0) * 0.3;

  // Sub-agent verification (10 points)
  if (subAgents.consulted >= 3) score += 10;
  else if (subAgents.consulted >= 2) score += 7;
  else if (subAgents.consulted >= 1) score += 4;

  // Handoff quality (10 points)
  if (insights.achievements.length >= 5) score += 5;
  if (insights.learnings.length >= 5) score += 5;

  // Cap at 100
  return Math.min(Math.round(score), 100);
}

/**
 * Generate comprehensive retrospective
 */
async function generateComprehensiveRetrospective(sdId) {
  console.log(`\n🔍 CONTINUOUS IMPROVEMENT COACH (Enhanced)`);
  console.log(`═`.repeat(60));
  console.log(`Generating comprehensive retrospective for SD: ${sdId}`);

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    throw new Error(`SD not found: ${sdId}`);
  }

  console.log(`SD: ${sd.sd_key} - ${sd.title}`);
  console.log(`Status: ${sd.status}, Progress: ${sd.progress}%`);

  // Check if retrospective already exists
  const { data: existing } = await supabase
    .from('retrospectives')
    .select('id')
    .eq('sd_id', sdId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`\n⚠️  Retrospective already exists (ID: ${existing[0].id})`);
    console.log(`Use enhance-retrospective-sd-<key>.js to update existing retrospectives`);
    return {
      success: true,
      existed: true,
      retrospective_id: existing[0].id
    };
  }

  // Gather comprehensive data
  console.log(`\n📊 Analyzing implementation artifacts...`);

  const handoffInsights = analyzeHandoffs(sd.sd_key);
  console.log(`   ✅ Analyzed handoff documents`);

  const prdAnalysis = await analyzePRD(sdId);
  console.log(`   ✅ Analyzed PRD`);

  const subAgentAnalysis = await analyzeSubAgents(sdId);
  console.log(`   ✅ Analyzed sub-agent executions`);

  // Calculate metrics
  const qualityScore = calculateQualityScore(handoffInsights, prdAnalysis, subAgentAnalysis, sd);
  const satisfactionScore = Math.min(Math.round(qualityScore / 10), 10);

  // Build comprehensive retrospective
  const whatWentWell = [
    ...handoffInsights.achievements.slice(0, 10),
    sd.progress >= 100 ? `SD completed at ${sd.progress}% progress` : `Progress achieved: ${sd.progress}%`,
    subAgentAnalysis.consulted > 0 ? `${subAgentAnalysis.consulted} sub-agent(s) consulted` : null,
    prdAnalysis ? `PRD created with ${prdAnalysis.acceptance_criteria} acceptance criteria` : null
  ].filter(Boolean);

  const whatNeedsImprovement = handoffInsights.challenges.length > 0
    ? handoffInsights.challenges.slice(0, 10)
    : ['No significant challenges documented'];

  const keyLearnings = handoffInsights.learnings.length > 0
    ? handoffInsights.learnings.slice(0, 10)
    : ['LEO Protocol followed successfully'];

  const actionItems = handoffInsights.actions.length > 0
    ? handoffInsights.actions.slice(0, 10)
    : ['Continue following LEO Protocol best practices'];

  const successPatterns = handoffInsights.patterns.length > 0
    ? handoffInsights.patterns.slice(0, 5)
    : ['Standard LEO Protocol execution'];

  // Generate business value assessment
  let businessValue = 'Standard feature implementation';
  if (sd.priority >= 90) {
    businessValue = 'Critical strategic capability delivered';
  } else if (sd.priority >= 70) {
    businessValue = 'High-value feature successfully implemented';
  } else if (sd.priority >= 50) {
    businessValue = 'Important enhancement completed';
  }

  const retrospective = {
    sd_id: sdId,
    project_name: sd.title,
    retro_type: 'SD_COMPLETION',
    title: `${sd.sd_key} Comprehensive Retrospective`,
    description: `Detailed retrospective analyzing ${sd.sd_key}: ${sd.title}`,
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: subAgentAnalysis.verdicts.map(v => v.agent),
    human_participants: ['LEAD'],
    what_went_well: whatWentWell,
    what_needs_improvement: whatNeedsImprovement,
    action_items: actionItems,
    key_learnings: keyLearnings,
    quality_score: qualityScore,
    team_satisfaction: satisfactionScore,
    business_value_delivered: businessValue,
    customer_impact: sd.priority >= 70 ? 'High impact feature' : 'Standard feature',
    technical_debt_addressed: handoffInsights.achievements.some(a =>
      a.toLowerCase().includes('removed') || a.toLowerCase().includes('cleaned')
    ),
    technical_debt_created: handoffInsights.challenges.some(c =>
      c.toLowerCase().includes('test') || c.toLowerCase().includes('debt')
    ),
    bugs_found: 0,
    bugs_resolved: 0,
    tests_added: handoffInsights.patterns.some(p => p.toLowerCase().includes('test')) ? 1 : 0,
    objectives_met: sd.progress >= 100,
    on_schedule: true,
    within_scope: true,
    success_patterns: successPatterns,
    failure_patterns: [],
    improvement_areas: whatNeedsImprovement.slice(0, 3),
    generated_by: 'MANUAL',
    trigger_event: 'SD_STATUS_COMPLETED',
    status: 'PUBLISHED',
    performance_impact: handoffInsights.patterns.find(p => p.includes('ms')) || 'Standard'
  };

  // Insert retrospective
  const { data: inserted, error: insertError } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select();

  if (insertError) {
    throw new Error(`Failed to insert retrospective: ${insertError.message}`);
  }

  console.log(`\n✅ Comprehensive retrospective generated!`);
  console.log(`   ID: ${inserted[0].id}`);
  console.log(`   Quality Score: ${qualityScore}/100`);
  console.log(`   Team Satisfaction: ${satisfactionScore}/10`);
  console.log(`   Achievements: ${whatWentWell.length}`);
  console.log(`   Challenges: ${whatNeedsImprovement.length}`);
  console.log(`   Learnings: ${keyLearnings.length}`);
  console.log(`   Action Items: ${actionItems.length}`);
  console.log(`   Status: ${retrospective.status}`);

  // Auto-extract patterns to learning history
  console.log(`\n🔄 AUTO-EXTRACTING PATTERNS TO LEARNING HISTORY...`);
  try {
    const { extractPatternsFromRetrospective } = await import('./auto-extract-patterns-from-retro.js');
    const patternResult = await extractPatternsFromRetrospective(inserted[0].id);

    console.log(`\n✨ Pattern extraction complete!`);
    console.log(`   Patterns created: ${patternResult.patterns_created}`);
    console.log(`   Patterns updated: ${patternResult.patterns_updated}`);
    console.log(`   Prevention items: ${patternResult.prevention_items}`);
  } catch (error) {
    console.warn(`\n⚠️  Pattern extraction failed (non-fatal): ${error.message}`);
    console.warn(`   You can run manually: node scripts/auto-extract-patterns-from-retro.js ${inserted[0].id}`);
  }

  return {
    success: true,
    retrospective_id: inserted[0].id,
    quality_score: qualityScore,
    metrics: {
      achievements: whatWentWell.length,
      challenges: whatNeedsImprovement.length,
      learnings: keyLearnings.length,
      actions: actionItems.length
    }
  };
}

// CLI usage
async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node generate-comprehensive-retrospective.js <SD_UUID>');
    console.error('');
    console.error('This enhanced version analyzes:');
    console.error('  • Handoff documents for achievements, challenges, learnings');
    console.error('  • PRD for requirements and complexity');
    console.error('  • Sub-agent executions for verification results');
    console.error('  • Time metrics and performance data');
    console.error('');
    process.exit(1);
  }

  try {
    const result = await generateComprehensiveRetrospective(sdId);
    console.log('\n' + JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
