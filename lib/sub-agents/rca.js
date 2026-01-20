#!/usr/bin/env node
/**
 * 🔬 RCA (Root Cause Analysis) Sub-Agent
 *
 * Full forensic analysis sub-agent for failure investigation.
 * Performs 5-Whys analysis, causal chain building, and pattern matching.
 *
 * Activation Triggers:
 * - Sub-agent failures (verdict = BLOCKED or CRITICAL)
 * - Test failures (E2E, unit, integration)
 * - Quality gate failures
 * - Handoff rejections
 *
 * Outputs:
 * - Root cause identification
 * - Causal chain (5-Whys)
 * - Contributing factors
 * - CAPA recommendations
 * - Learning records for EVA
 *
 * Created: 2026-01-03 (TODO Implementation Fix)
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Execute RCA Sub-Agent for forensic analysis of a Root Cause Report
 *
 * @param {string} rcrId - Root Cause Report ID (UUID)
 * @param {Object} subAgent - Sub-agent configuration from database
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Analysis results
 */
export async function execute(rcrId, subAgent, options = {}) {
  console.log(`\n🔬 RCA SUB-AGENT - Forensic Analysis for RCR ${rcrId}\n`);

  // Initialize Supabase client with SERVICE_ROLE_KEY
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const results = {
    rcr_id: rcrId,
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence: 0,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    analysis: {
      root_cause: null,
      root_cause_category: null,
      causal_chain: [],
      contributing_factors: [],
      pattern_matches: []
    },
    metadata: {}
  };

  try {
    // ============================================
    // 1. FETCH ROOT CAUSE REPORT
    // ============================================
    console.log('📋 Step 1: Fetching Root Cause Report...');
    const { data: rcr, error: rcrError } = await supabase
      .from('root_cause_reports')
      .select('*')
      .eq('id', rcrId)
      .single();

    if (rcrError || !rcr) {
      throw new Error(`Failed to fetch RCR: ${rcrError?.message || 'RCR not found'}`);
    }

    console.log(`   ✓ RCR fetched: ${rcr.failure_signature.substring(0, 60)}...`);
    console.log(`   Status: ${rcr.status}, Tier: T${rcr.trigger_tier}`);
    console.log(`   Source: ${rcr.trigger_source}, Scope: ${rcr.scope_type}`);

    results.metadata.rcr_status = rcr.status;
    results.metadata.trigger_tier = rcr.trigger_tier;
    results.metadata.scope_type = rcr.scope_type;

    // ============================================
    // 2. FETCH RELATED CONTEXT
    // ============================================
    console.log('\n📦 Step 2: Fetching related context...');

    // Get SD if linked
    let sd = null;
    if (rcr.sd_id) {
      const { data: sdData } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, category, sd_type')
        .eq('id', rcr.sd_id)
        .single();
      sd = sdData;
      console.log(`   ✓ SD: ${sd?.title || 'Not found'}`);
    }

    // Get PRD if linked
    let prd = null;
    if (rcr.prd_id) {
      const { data: prdData } = await supabase
        .from('product_requirements_v2')
        .select('id, title, phase, status')
        .eq('id', rcr.prd_id)
        .single();
      prd = prdData;
      console.log(`   ✓ PRD: ${prd?.title || 'Not found'}`);
    }

    // Get historical patterns
    const { data: historicalRCRs } = await supabase
      .from('root_cause_reports')
      .select('id, failure_signature, root_cause_category, root_cause, status, pattern_id')
      .neq('id', rcrId)
      .eq('scope_type', rcr.scope_type)
      .order('created_at', { ascending: false })
      .limit(10);

    console.log(`   ✓ Historical RCRs: ${historicalRCRs?.length || 0} for pattern matching`);

    // ============================================
    // 3. PERFORM 5-WHYS ANALYSIS
    // ============================================
    console.log('\n🔍 Step 3: Performing 5-Whys Analysis...');

    const causalChain = performFiveWhysAnalysis(rcr, sd, prd);
    results.analysis.causal_chain = causalChain;

    console.log(`   ✓ Causal chain depth: ${causalChain.length} levels`);
    for (const step of causalChain) {
      console.log(`      Why ${step.level}: ${step.question.substring(0, 50)}...`);
    }

    // ============================================
    // 4. IDENTIFY ROOT CAUSE
    // ============================================
    console.log('\n🎯 Step 4: Identifying root cause...');

    const { rootCause, category, confidence } = identifyRootCause(rcr, causalChain);
    results.analysis.root_cause = rootCause;
    results.analysis.root_cause_category = category;
    results.confidence = confidence;

    console.log(`   ✓ Root Cause: ${rootCause.substring(0, 60)}...`);
    console.log(`   ✓ Category: ${category}`);
    console.log(`   ✓ Confidence: ${confidence}%`);

    // ============================================
    // 5. PATTERN MATCHING
    // ============================================
    console.log('\n🔗 Step 5: Pattern matching with historical RCRs...');

    const patternMatches = findPatternMatches(rcr, historicalRCRs || []);
    results.analysis.pattern_matches = patternMatches;

    if (patternMatches.length > 0) {
      console.log(`   ✓ Found ${patternMatches.length} pattern match(es)`);
      for (const match of patternMatches.slice(0, 3)) {
        console.log(`      - ${match.pattern_id}: ${match.similarity}% similarity`);
      }
    } else {
      console.log('   ℹ️  No pattern matches found (unique failure)');
    }

    // ============================================
    // 6. IDENTIFY CONTRIBUTING FACTORS
    // ============================================
    console.log('\n📊 Step 6: Identifying contributing factors...');

    const contributingFactors = identifyContributingFactors(rcr, sd, prd, causalChain);
    results.analysis.contributing_factors = contributingFactors;

    console.log(`   ✓ Contributing factors: ${contributingFactors.length}`);
    for (const factor of contributingFactors) {
      console.log(`      - ${factor.factor}: ${factor.weight}% weight`);
    }

    // ============================================
    // 7. GENERATE RECOMMENDATIONS
    // ============================================
    console.log('\n💡 Step 7: Generating recommendations...');

    results.recommendations = generateRecommendations(
      rootCause,
      category,
      contributingFactors,
      patternMatches
    );

    console.log(`   ✓ Generated ${results.recommendations.length} recommendation(s)`);

    // ============================================
    // 8. UPDATE RCR WITH FINDINGS
    // ============================================
    console.log('\n💾 Step 8: Updating RCR with findings...');

    const updatePayload = {
      root_cause: rootCause,
      root_cause_category: category,
      causal_chain: causalChain,
      contributing_factors: contributingFactors,
      confidence: confidence,
      pattern_id: patternMatches.length > 0 ? patternMatches[0].pattern_id : null,
      related_rcr_ids: patternMatches.map(m => m.rcr_id).slice(0, 5),
      status: confidence >= 70 ? 'CAPA_PENDING' : 'IN_REVIEW',
      analysis_attempts: (rcr.analysis_attempts || 0) + 1,
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('root_cause_reports')
      .update(updatePayload)
      .eq('id', rcrId);

    if (updateError) {
      results.warnings.push(`Failed to update RCR: ${updateError.message}`);
      console.log(`   ⚠️  Update failed: ${updateError.message}`);
    } else {
      console.log(`   ✓ RCR updated (status: ${updatePayload.status})`);
    }

    // ============================================
    // 9. CREATE LEARNING RECORD
    // ============================================
    if (confidence >= 60 && !options.skipLearning) {
      console.log('\n📚 Step 9: Creating learning record...');

      const learningPayload = {
        rcr_id: rcrId,
        lesson_type: mapCategoryToLessonType(category),
        lesson_summary: `Root cause: ${rootCause.substring(0, 200)}`,
        prevention_guidance: results.recommendations.slice(0, 3).map(r => r.action).join('; '),
        pattern_id: patternMatches.length > 0 ? patternMatches[0].pattern_id : null,
        confidence_level: confidence >= 80 ? 'HIGH' : confidence >= 60 ? 'MEDIUM' : 'LOW',
        metadata: {
          category,
          contributing_factors: contributingFactors.length,
          pattern_matches: patternMatches.length
        }
      };

      const { error: learningError } = await supabase
        .from('rca_learning_records')
        .insert(learningPayload);

      if (learningError) {
        console.log(`   ⚠️  Learning record failed: ${learningError.message}`);
      } else {
        console.log('   ✓ Learning record created for EVA integration');
      }
    }

    // ============================================
    // 10. DETERMINE VERDICT
    // ============================================
    if (confidence < 60) {
      results.verdict = 'NEEDS_REVIEW';
      results.warnings.push('Low confidence analysis - manual review recommended');
    } else if (confidence < 70) {
      results.verdict = 'PASS';
      results.warnings.push('Moderate confidence - consider additional evidence');
    } else {
      results.verdict = 'PASS';
    }

    console.log(`\n✅ RCA Complete: ${results.verdict} (${results.confidence}% confidence)`);

  } catch (error) {
    console.error(`\n❌ RCA Failed: ${error.message}`);
    results.verdict = 'ERROR';
    results.critical_issues.push({
      severity: 'ERROR',
      issue: error.message,
      recommendation: 'Check RCR ID and database connectivity'
    });
  }

  return results;
}

/**
 * Perform 5-Whys analysis on the failure
 */
function performFiveWhysAnalysis(rcr, sd, prd) {
  const chain = [];
  const problemStatement = rcr.problem_statement;
  const observed = rcr.observed || {};
  const expected = rcr.expected || {};

  // Level 1: Why did this failure occur?
  chain.push({
    level: 1,
    question: `Why did "${problemStatement}" occur?`,
    answer: `Observed: ${JSON.stringify(observed).substring(0, 100)}... Expected: ${JSON.stringify(expected).substring(0, 100)}...`,
    evidence: 'failure_signature'
  });

  // Level 2: Why was the observed behavior different?
  const triggerSource = rcr.trigger_source;
  chain.push({
    level: 2,
    question: `Why was the ${triggerSource} behavior different from expected?`,
    answer: deriveLevel2Answer(rcr, triggerSource),
    evidence: 'trigger_source_analysis'
  });

  // Level 3: Why did the root condition exist?
  chain.push({
    level: 3,
    question: 'Why did this root condition exist in the codebase/configuration?',
    answer: deriveLevel3Answer(rcr, sd, prd),
    evidence: 'context_analysis'
  });

  // Level 4: Why wasn't this caught earlier?
  chain.push({
    level: 4,
    question: 'Why wasn\'t this issue caught during earlier phases?',
    answer: deriveLevel4Answer(rcr),
    evidence: 'process_gap_analysis'
  });

  // Level 5: What systemic factor allowed this?
  chain.push({
    level: 5,
    question: 'What systemic or process factor allowed this issue to occur?',
    answer: deriveLevel5Answer(rcr, sd),
    evidence: 'systemic_analysis'
  });

  return chain;
}

function deriveLevel2Answer(rcr, triggerSource) {
  const answers = {
    'QUALITY_GATE': 'Quality gate validation logic detected a discrepancy between implementation and requirements',
    'CI_PIPELINE': 'CI/CD pipeline execution revealed build, test, or deployment issues',
    'RUNTIME': 'Production runtime monitoring detected anomalous behavior or errors',
    'MANUAL': 'Manual inspection or user report identified unexpected behavior',
    'SUB_AGENT': 'Sub-agent automated analysis detected validation failures',
    'TEST_FAILURE': 'Test suite execution revealed failing assertions or coverage gaps',
    'HANDOFF_REJECTION': 'Phase handoff validation rejected due to incomplete or invalid criteria'
  };
  return answers[triggerSource] || 'Unknown trigger source behavior';
}

function deriveLevel3Answer(rcr, sd, prd) {
  if (prd && !prd.status?.includes('approved')) {
    return 'PRD requirements may not have been fully validated before implementation';
  }
  if (sd?.status === 'active' && rcr.trigger_tier === 1) {
    return 'Critical issue in active SD suggests implementation gap or requirements misunderstanding';
  }
  return 'Implementation proceeded without complete validation of edge cases or error handling';
}

function deriveLevel4Answer(rcr) {
  const tier = rcr.trigger_tier;
  if (tier === 1) {
    return 'T1 critical issue - likely missed due to insufficient test coverage or review depth';
  }
  if (tier === 2) {
    return 'T2 high priority - may have been deprioritized or overlooked in code review';
  }
  return 'Lower priority issue may have been acceptable risk or known limitation';
}

function deriveLevel5Answer(rcr, _sd) {
  const category = rcr.scope_type;
  const factors = {
    'SD': 'Strategic directive scope may have been too broad or requirements ambiguous',
    'PRD': 'Product requirements may need additional validation gates',
    'PIPELINE': 'CI/CD pipeline configuration may need additional quality checks',
    'RUNTIME': 'Production monitoring and alerting may need enhancement',
    'SUB_AGENT': 'Sub-agent coverage or trigger conditions may need expansion'
  };
  return factors[category] || 'Process improvements needed for earlier detection';
}

/**
 * Identify the root cause and category
 */
function identifyRootCause(rcr, causalChain) {
  // Use the deepest level of the causal chain as root cause basis
  const deepestWhy = causalChain[causalChain.length - 1];

  // Determine category based on trigger source and scope
  let category = 'UNKNOWN';
  const trigger = rcr.trigger_source;
  const scope = rcr.scope_type;

  if (trigger === 'TEST_FAILURE') {
    category = 'TEST_COVERAGE_GAP';
  } else if (trigger === 'CI_PIPELINE') {
    category = 'INFRASTRUCTURE';
  } else if (trigger === 'QUALITY_GATE' && scope === 'PRD') {
    category = 'REQUIREMENTS_AMBIGUITY';
  } else if (trigger === 'SUB_AGENT') {
    category = 'CODE_DEFECT';
  } else if (trigger === 'RUNTIME') {
    category = 'ENVIRONMENTAL';
  } else if (trigger === 'HANDOFF_REJECTION') {
    category = 'PROCESS_GAP';
  } else {
    category = 'CODE_DEFECT';
  }

  // Calculate confidence based on evidence quality
  let confidence = 40; // Base confidence

  // Add log quality (0-20)
  confidence += rcr.log_quality || 10;

  // Add evidence strength (0-20)
  confidence += rcr.evidence_strength || 10;

  // Add pattern match score (0-15)
  confidence += rcr.pattern_match_score || 5;

  // Add historical success bonus (0-5)
  confidence += rcr.historical_success_bonus || 0;

  // Cap at 100
  confidence = Math.min(100, confidence);

  const rootCause = `${deepestWhy.answer} This indicates a ${category.toLowerCase().replace(/_/g, ' ')} that requires ${getRootCauseActionType(category)}.`;

  return { rootCause, category, confidence };
}

function getRootCauseActionType(category) {
  const actions = {
    'CODE_DEFECT': 'code fix and enhanced testing',
    'CONFIG_ERROR': 'configuration correction and validation',
    'INFRASTRUCTURE': 'infrastructure remediation and monitoring',
    'PROCESS_GAP': 'process improvement and documentation',
    'REQUIREMENTS_AMBIGUITY': 'requirements clarification and PRD update',
    'TEST_COVERAGE_GAP': 'expanded test coverage and automation',
    'DEPENDENCY_ISSUE': 'dependency update or isolation',
    'ENVIRONMENTAL': 'environment configuration and monitoring',
    'UNKNOWN': 'further investigation and manual review'
  };
  return actions[category] || 'remediation';
}

/**
 * Find pattern matches with historical RCRs
 */
function findPatternMatches(rcr, historicalRCRs) {
  const matches = [];

  for (const historical of historicalRCRs) {
    if (!historical.failure_signature || !historical.root_cause_category) continue;

    // Calculate similarity based on multiple factors
    let similarity = 0;

    // Same category = 40% similarity
    if (historical.root_cause_category === rcr.root_cause_category ||
        historical.root_cause_category === inferCategory(rcr)) {
      similarity += 40;
    }

    // Similar failure signature keywords = up to 40%
    const currentWords = new Set(rcr.failure_signature.toLowerCase().split(/\W+/));
    const historicalWords = new Set(historical.failure_signature.toLowerCase().split(/\W+/));
    const intersection = [...currentWords].filter(w => historicalWords.has(w));
    const signatureSimilarity = Math.min(40, (intersection.length / currentWords.size) * 40);
    similarity += signatureSimilarity;

    // Same scope type = 20%
    if (historical.scope_type === rcr.scope_type) {
      similarity += 20;
    }

    if (similarity >= 50) {
      matches.push({
        rcr_id: historical.id,
        pattern_id: historical.pattern_id || `PAT-${historical.root_cause_category}-${historical.id.substring(0, 8)}`,
        similarity: Math.round(similarity),
        category: historical.root_cause_category,
        resolved: historical.status === 'RESOLVED'
      });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}

function inferCategory(rcr) {
  const trigger = rcr.trigger_source;
  const categories = {
    'TEST_FAILURE': 'TEST_COVERAGE_GAP',
    'CI_PIPELINE': 'INFRASTRUCTURE',
    'QUALITY_GATE': 'CODE_DEFECT',
    'SUB_AGENT': 'CODE_DEFECT',
    'RUNTIME': 'ENVIRONMENTAL',
    'HANDOFF_REJECTION': 'PROCESS_GAP'
  };
  return categories[trigger] || 'UNKNOWN';
}

/**
 * Identify contributing factors
 */
function identifyContributingFactors(rcr, sd, prd, causalChain) {
  const factors = [];

  // Check trigger tier impact
  if (rcr.trigger_tier === 1) {
    factors.push({
      factor: 'Critical severity classification',
      weight: 25,
      evidence: 'T1 trigger indicates blocking issue'
    });
  }

  // Check scope breadth
  if (rcr.scope_type === 'SD') {
    factors.push({
      factor: 'SD-level scope',
      weight: 20,
      evidence: 'Failure at strategic directive level affects multiple components'
    });
  }

  // Check if PRD exists and status
  if (!prd) {
    factors.push({
      factor: 'Missing PRD',
      weight: 15,
      evidence: 'No product requirements document - requirements may be unclear'
    });
  } else if (prd.phase === 'draft') {
    factors.push({
      factor: 'Incomplete PRD',
      weight: 10,
      evidence: `PRD in ${prd.phase} phase - requirements not finalized`
    });
  }

  // Check analysis attempts
  if ((rcr.analysis_attempts || 0) > 1) {
    factors.push({
      factor: 'Repeated analysis required',
      weight: 15,
      evidence: `${rcr.analysis_attempts} analysis attempts indicate complex root cause`
    });
  }

  // Check recurrence
  if (rcr.recurrence_count > 1) {
    factors.push({
      factor: 'Recurring issue',
      weight: 20,
      evidence: `Issue has occurred ${rcr.recurrence_count} time(s)`
    });
  }

  // Causal chain depth factor
  if (causalChain.length >= 5) {
    factors.push({
      factor: 'Deep causal chain',
      weight: 10,
      evidence: 'Full 5-Whys analysis reveals systemic root cause'
    });
  }

  return factors.sort((a, b) => b.weight - a.weight);
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(rootCause, category, contributingFactors, patternMatches) {
  const recommendations = [];

  // Category-specific recommendations
  const categoryRecs = {
    'CODE_DEFECT': {
      action: 'Review and fix the identified code defect',
      priority: 'HIGH',
      type: 'IMMEDIATE_FIX'
    },
    'TEST_COVERAGE_GAP': {
      action: 'Expand test coverage to include the failure scenario',
      priority: 'HIGH',
      type: 'TEST_ENHANCEMENT'
    },
    'REQUIREMENTS_AMBIGUITY': {
      action: 'Clarify PRD requirements and update acceptance criteria',
      priority: 'MEDIUM',
      type: 'REQUIREMENTS_UPDATE'
    },
    'PROCESS_GAP': {
      action: 'Update process documentation and add validation checkpoints',
      priority: 'MEDIUM',
      type: 'PROCESS_IMPROVEMENT'
    },
    'INFRASTRUCTURE': {
      action: 'Review and update infrastructure configuration',
      priority: 'HIGH',
      type: 'INFRASTRUCTURE_FIX'
    },
    'ENVIRONMENTAL': {
      action: 'Add environment monitoring and alerting',
      priority: 'MEDIUM',
      type: 'MONITORING_ENHANCEMENT'
    },
    'DEPENDENCY_ISSUE': {
      action: 'Update or isolate problematic dependency',
      priority: 'HIGH',
      type: 'DEPENDENCY_UPDATE'
    }
  };

  if (categoryRecs[category]) {
    recommendations.push(categoryRecs[category]);
  }

  // Add pattern-based recommendations
  if (patternMatches.length > 0) {
    const resolvedPatterns = patternMatches.filter(p => p.resolved);
    if (resolvedPatterns.length > 0) {
      recommendations.push({
        action: `Review resolution from similar pattern (${resolvedPatterns[0].pattern_id})`,
        priority: 'MEDIUM',
        type: 'PATTERN_LEARNING'
      });
    } else {
      recommendations.push({
        action: 'This is part of an unresolved pattern - prioritize systemic fix',
        priority: 'HIGH',
        type: 'PATTERN_ALERT'
      });
    }
  }

  // Add factor-based recommendations
  for (const factor of contributingFactors.slice(0, 2)) {
    if (factor.factor.includes('Missing PRD')) {
      recommendations.push({
        action: 'Create comprehensive PRD before continuing implementation',
        priority: 'HIGH',
        type: 'PRD_CREATION'
      });
    }
    if (factor.factor.includes('Recurring')) {
      recommendations.push({
        action: 'Implement automated regression prevention for this failure type',
        priority: 'HIGH',
        type: 'REGRESSION_PREVENTION'
      });
    }
  }

  return recommendations;
}

/**
 * Map category to learning record lesson type
 */
function mapCategoryToLessonType(category) {
  const mapping = {
    'CODE_DEFECT': 'TECHNICAL',
    'CONFIG_ERROR': 'OPERATIONAL',
    'INFRASTRUCTURE': 'INFRASTRUCTURE',
    'PROCESS_GAP': 'PROCESS',
    'REQUIREMENTS_AMBIGUITY': 'REQUIREMENTS',
    'TEST_COVERAGE_GAP': 'TESTING',
    'DEPENDENCY_ISSUE': 'DEPENDENCY',
    'ENVIRONMENTAL': 'OPERATIONAL',
    'UNKNOWN': 'GENERAL'
  };
  return mapping[category] || 'GENERAL';
}

// Export for sub-agent executor
export default { execute };
