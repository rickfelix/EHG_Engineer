import { createClient  } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Enhanced 6-dimension evaluation rubric
const _evaluationRubric = {
  'Business_Value': {
    name: 'Business Value & Impact',
    description: 'Direct impact on business objectives and revenue potential',
    criteria: {
      5: 'Critical business impact, directly drives revenue or competitive advantage',
      4: 'High business impact, significant improvement to core operations',
      3: 'Moderate business impact, supports key business functions',
      2: 'Limited business impact, nice-to-have improvement',
      1: 'Minimal business impact, low priority enhancement'
    }
  },
  'Technical_Complexity': {
    name: 'Technical Complexity & Risk',
    description: 'Development complexity, technical risk, and resource requirements',
    criteria: {
      5: 'Simple implementation, low risk, uses existing patterns',
      4: 'Straightforward implementation, manageable complexity',
      3: 'Moderate complexity, some new patterns or integrations',
      2: 'High complexity, significant new development required',
      1: 'Very high complexity, major architectural changes needed'
    }
  },
  'User_Impact': {
    name: 'User Experience & Adoption',
    description: 'Impact on user experience, adoption potential, and user satisfaction',
    criteria: {
      5: 'Major UX improvement, high adoption potential, solves key user pain',
      4: 'Significant UX enhancement, good adoption expected',
      3: 'Moderate UX improvement, decent user value',
      2: 'Minor UX enhancement, limited user benefit',
      1: 'Minimal UX impact, low user value'
    }
  },
  'Time_to_Value': {
    name: 'Time to Value & ROI',
    description: 'Speed of implementation and time to realize benefits',
    criteria: {
      5: 'Quick implementation (1-2 weeks), immediate value',
      4: 'Fast implementation (3-4 weeks), quick value realization',
      3: 'Moderate timeline (1-2 months), reasonable ROI',
      2: 'Longer timeline (2-3 months), delayed value',
      1: 'Extended timeline (3+ months), uncertain ROI'
    }
  },
  'Market_Readiness': {
    name: 'Market Readiness & Timing',
    description: 'Market demand, competitive positioning, and timing alignment',
    criteria: {
      5: 'High market demand, perfect timing, competitive advantage',
      4: 'Good market demand, favorable timing',
      3: 'Moderate market interest, acceptable timing',
      2: 'Limited market demand, timing concerns',
      1: 'Low market demand, poor timing, early/late to market'
    }
  },
  'Strategic_Priority_Alignment': {
    name: 'Strategic Priority Alignment',
    description: 'Alignment with Stage 1 Ideation, EVA Assistant, and GTM priorities',
    criteria: {
      5: 'Perfect alignment with multiple strategic priorities (8+ keyword matches)',
      4: 'Strong alignment with strategic priorities (5-7 keyword matches)',
      3: 'Moderate alignment with strategic priorities (3-4 keyword matches)',
      2: 'Limited alignment with strategic priorities (1-2 keyword matches)',
      1: 'No alignment with strategic priorities (0 keyword matches)'
    }
  }
};

// Strategic priority keywords for scoring
const strategicKeywords = {
  'Stage_1_Ideation': ['ideation', 'innovation', 'validation', 'concept', 'insight', 'customer insight', 'discovery', 'research', 'prototype', 'market fit', 'user research', 'feedback', 'test', 'experiment', 'mvp', 'pilot'],
  'EVA_Assistant': ['eva', 'assistant', 'ai', 'automation', 'workflow', 'process', 'efficiency', 'voice', 'chat', 'interface', 'user experience', 'interaction', 'help', 'guidance', 'support'],
  'GTM_Stage': ['gtm', 'go-to-market', 'sales', 'marketing', 'revenue', 'customer', 'acquisition', 'conversion', 'monetization', 'pricing', 'billing', 'subscription', 'analytics', 'metrics', 'tracking', 'dashboard', 'reporting']
};

function calculateStrategicAlignment(sdText) {
  const text = sdText.toLowerCase();
  let totalMatches = 0;

  Object.values(strategicKeywords).forEach(keywords => {
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      totalMatches += (text.match(regex) || []).length;
    });
  });

  // Convert to 1-5 scale
  if (totalMatches >= 8) return 5;
  if (totalMatches >= 5) return 4;
  if (totalMatches >= 3) return 3;
  if (totalMatches >= 1) return 2;
  return 1;
}

async function evaluateDeferredSDs() {
  console.log('🔍 Re-evaluating Deferred Strategic Directives');
  console.log('==============================================');

  // Get all deferred SDs
  const { data: deferredSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('status', 'deferred')
    .order('priority', { ascending: false });

  if (error) {
    console.error('❌ Error fetching deferred SDs:', error);
    return;
  }

  console.log('✅ Found', deferredSDs.length, 'deferred Strategic Directives\n');

  const evaluationResults = [];

  deferredSDs.forEach(sd => {
    const fullText = [sd.title, sd.description, sd.scope, sd.strategic_intent, sd.rationale, sd.strategic_objectives, sd.success_criteria, sd.implementation_guidelines]
      .filter(Boolean)
      .join(' ');

    // Calculate strategic alignment score
    const strategicScore = calculateStrategicAlignment(fullText);

    // Manual evaluation for other dimensions (simplified for demonstration)
    // In practice, these would be evaluated based on SD content analysis
    const evaluation = {
      id: sd.id,
      title: sd.title,
      currentPriority: sd.priority,
      strategicAlignment: strategicScore,

      // Simplified scoring based on SD characteristics
      businessValue: sd.priority === 'high' ? 4 : sd.priority === 'medium' ? 3 : 2,
      technicalComplexity: 3, // Default moderate complexity
      userImpact: strategicScore >= 3 ? 4 : 3, // Higher if strategically aligned
      timeToValue: 3, // Default moderate timeline
      marketReadiness: strategicScore >= 4 ? 4 : 3, // Higher if strong alignment

      totalScore: 0,
      recommendation: '',
      reasoning: ''
    };

    // Calculate total score
    evaluation.totalScore = evaluation.businessValue + evaluation.technicalComplexity +
                           evaluation.userImpact + evaluation.timeToValue +
                           evaluation.marketReadiness + evaluation.strategicAlignment;

    // Generate recommendation based on total score
    if (evaluation.totalScore >= 20 && evaluation.strategicAlignment >= 3) {
      evaluation.recommendation = 'RESTORE TO ACTIVE';
      evaluation.reasoning = 'High strategic alignment with good overall score justifies restoration';
    } else if (evaluation.totalScore >= 18) {
      evaluation.recommendation = 'CONSIDER RESTORATION';
      evaluation.reasoning = 'Good overall score but review strategic priority vs other SDs';
    } else {
      evaluation.recommendation = 'KEEP DEFERRED';
      evaluation.reasoning = 'Low overall score or poor strategic alignment confirms deferral';
    }

    evaluationResults.push(evaluation);
  });

  // Display results
  console.log('📊 Evaluation Results:');
  console.log('=====================\n');

  evaluationResults.forEach(result => {
    console.log(`🎯 ${result.id} - ${result.title}`);
    console.log(`   Current Priority: ${result.currentPriority}`);
    console.log(`   📈 Scores: Business(${result.businessValue}) + Technical(${result.technicalComplexity}) + User(${result.userImpact}) + Time(${result.timeToValue}) + Market(${result.marketReadiness}) + Strategic(${result.strategicAlignment}) = ${result.totalScore}/30`);
    console.log(`   🎯 Strategic Alignment: ${result.strategicAlignment}/5`);
    console.log(`   💡 Recommendation: ${result.recommendation}`);
    console.log(`   📝 Reasoning: ${result.reasoning}\n`);
  });

  // Summary recommendations
  const restoreCount = evaluationResults.filter(r => r.recommendation === 'RESTORE TO ACTIVE').length;
  const considerCount = evaluationResults.filter(r => r.recommendation === 'CONSIDER RESTORATION').length;
  const keepDeferredCount = evaluationResults.filter(r => r.recommendation === 'KEEP DEFERRED').length;

  console.log('📋 Summary Recommendations:');
  console.log('===========================');
  console.log(`🟢 Restore to Active: ${restoreCount} SDs`);
  console.log(`🟡 Consider Restoration: ${considerCount} SDs`);
  console.log(`🔴 Keep Deferred: ${keepDeferredCount} SDs\n`);

  // Specific actions for restoration candidates
  const restorationCandidates = evaluationResults.filter(r => r.recommendation === 'RESTORE TO ACTIVE');
  if (restorationCandidates.length > 0) {
    console.log('🔄 Recommended Status Changes:');
    console.log('==============================');
    restorationCandidates.forEach(candidate => {
      console.log(`UPDATE strategic_directives_v2 SET status = 'active' WHERE id = '${candidate.id}';`);
    });
  }

  return evaluationResults;
}

evaluateDeferredSDs().catch(console.error);