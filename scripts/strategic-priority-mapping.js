import { createClient  } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function mapStrategicPriorities() {
  console.log('📊 Strategic Priority Mapping Analysis');
  console.log('=====================================');

  // Get all SDs with backlog context
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, description, scope, priority, status, strategic_intent, rationale, strategic_objectives, success_criteria, implementation_guidelines, created_at')
    .order('priority', { ascending: false });

  if (error) {
    console.error('❌ Error fetching SDs:', error);
    return;
  }

  console.log('✅ Retrieved', sds.length, 'Strategic Directives');

  // Strategic priority definitions with keyword detection
  const strategicPriorities = {
    'Stage_1_Ideation': {
      name: 'Stage 1 Ideation Process',
      keywords: ['ideation', 'innovation', 'validation', 'concept', 'insight', 'customer insight', 'discovery', 'research', 'prototype', 'market fit', 'user research', 'feedback', 'test', 'experiment', 'mvp', 'pilot'],
      description: 'Features supporting early-stage business development, customer validation, and innovation processes'
    },
    'EVA_Assistant': {
      name: 'EVA Assistant Capabilities',
      keywords: ['eva', 'assistant', 'ai', 'automation', 'workflow', 'process', 'efficiency', 'voice', 'chat', 'interface', 'user experience', 'interaction', 'help', 'guidance', 'support'],
      description: 'AI assistant features, automation capabilities, and intelligent user interactions'
    },
    'GTM_Stage': {
      name: 'Go-To-Market Capabilities',
      keywords: ['gtm', 'go-to-market', 'sales', 'marketing', 'revenue', 'customer', 'acquisition', 'conversion', 'monetization', 'pricing', 'billing', 'subscription', 'analytics', 'metrics', 'tracking', 'dashboard', 'reporting'],
      description: 'Revenue generation, customer acquisition, and business growth features'
    }
  };

  // Analyze each SD for strategic alignment
  const alignmentResults = [];

  sds.forEach(sd => {
    const fullText = [sd.title, sd.description, sd.scope, sd.strategic_intent, sd.rationale, sd.strategic_objectives, sd.success_criteria, sd.implementation_guidelines]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const scores = {};
    let maxScore = 0;
    let primaryAlignment = 'Infrastructure';

    // Calculate alignment scores for each priority
    Object.entries(strategicPriorities).forEach(([key, priority]) => {
      const matchCount = priority.keywords.reduce((count, keyword) => {
        const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        return count + (fullText.match(regex) || []).length;
      }, 0);

      scores[key] = matchCount;
      if (matchCount > maxScore) {
        maxScore = matchCount;
        primaryAlignment = priority.name;
      }
    });

    // If no strategic alignment, classify as Infrastructure
    if (maxScore === 0) {
      primaryAlignment = 'Infrastructure/Foundation';
    }

    alignmentResults.push({
      id: sd.id,
      title: sd.title,
      priority: sd.priority,
      status: sd.status,
      primaryAlignment,
      scores,
      totalMatches: maxScore
    });
  });

  // Group by strategic alignment
  const groupedByAlignment = alignmentResults.reduce((groups, sd) => {
    const key = sd.primaryAlignment;
    if (!groups[key]) groups[key] = [];
    groups[key].push(sd);
    return groups;
  }, {});

  // Display results
  console.log('\n🎯 Strategic Priority Alignment Results');
  console.log('======================================');

  Object.entries(groupedByAlignment).forEach(([alignment, sds]) => {
    console.log('\n📂', alignment, '(', sds.length, 'SDs)');
    console.log('─'.repeat(50));

    sds.forEach(sd => {
      const scoreText = Object.entries(sd.scores)
        .filter(([_, score]) => score > 0)
        .map(([key, score]) => key.replace('_', ' ') + ':' + score)
        .join(', ') || 'No matches';

      console.log('  •', sd.id, '-', sd.title.substring(0, 60) + (sd.title.length > 60 ? '...' : ''));
      console.log('    Priority:', sd.priority, '| Status:', sd.status, '| Matches:', scoreText);
    });
  });

  // Summary statistics
  console.log('\n📈 Summary Statistics');
  console.log('===================');
  Object.entries(groupedByAlignment).forEach(([alignment, sds]) => {
    const highPriority = sds.filter(sd => sd.priority >= 70).length;
    const activeWorking = sds.filter(sd => ['active', 'in_progress'].includes(sd.status)).length;

    console.log(alignment + ':');
    console.log('  Total:', sds.length, '| High Priority (≥70):', highPriority, '| Active/Working:', activeWorking);
  });

  return groupedByAlignment;
}

mapStrategicPriorities().catch(console.error);