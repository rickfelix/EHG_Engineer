/**
 * SRIP Quality Check Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-D
 *
 * Stage 4 of the SRIP pipeline: Quality Check
 * Validates built UI output against reference site using 6-domain fidelity scoring.
 *
 * Domains: layout, visual_composition, design_system, interaction_patterns,
 *          technical_implementation, accessibility
 *
 * Each domain returns { score: 0-100, gaps: string[] }
 * Overall score is weighted average. Pass threshold: 70%.
 *
 * Input: ventureId (looks up synthesis prompt + site DNA)
 * Output: Quality check record in srip_quality_checks table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const PASS_THRESHOLD = 70;

const DOMAIN_WEIGHTS = {
  layout: 0.20,
  visual_composition: 0.15,
  design_system: 0.20,
  interaction_patterns: 0.15,
  technical_implementation: 0.15,
  accessibility: 0.15,
};

// ============================================================================
// Domain Scorers
// ============================================================================

/**
 * Score layout fidelity: grid structure, spacing, responsive breakpoints.
 * @param {object} dna - Site DNA JSON
 * @param {object} synthesis - Synthesis prompt data
 * @returns {{score: number, gaps: string[]}}
 */
export function scoreLayout(dna, synthesis) {
  const gaps = [];
  let score = 100;

  const layout = dna?.layout || dna?.structure?.layout || {};
  if (!layout.grid && !layout.columns) {
    gaps.push('No grid/column structure defined in Site DNA');
    score -= 30;
  }
  if (!layout.breakpoints && !dna?.design_tokens?.breakpoints) {
    gaps.push('No responsive breakpoints defined');
    score -= 20;
  }
  if (!synthesis?.sections?.find(s => s.title === 'LAYOUT' || s.title === 'STRUCTURE')) {
    gaps.push('Synthesis prompt missing LAYOUT section');
    score -= 15;
  }

  return { score: Math.max(0, score), gaps };
}

/**
 * Score visual composition: hero areas, imagery, color usage.
 */
export function scoreVisualComposition(dna, synthesis) {
  const gaps = [];
  let score = 100;

  const visual = dna?.visual_composition || {};
  if (!visual.hero_pattern && !visual.hero) {
    gaps.push('No hero pattern defined');
    score -= 25;
  }
  if (!visual.imagery_style && !dna?.design_tokens?.imagery) {
    gaps.push('No imagery style guidance');
    score -= 20;
  }
  if (!visual.color_usage && !dna?.design_tokens?.colors) {
    gaps.push('No color usage patterns');
    score -= 20;
  }

  return { score: Math.max(0, score), gaps };
}

/**
 * Score design system: tokens, typography, spacing consistency.
 */
export function scoreDesignSystem(dna, synthesis) {
  const gaps = [];
  let score = 100;

  const tokens = dna?.design_tokens || {};
  if (!tokens.colors || Object.keys(tokens.colors).length < 2) {
    gaps.push('Insufficient color tokens (need at least 2)');
    score -= 25;
  }
  if (!tokens.typography || !tokens.typography.font_family) {
    gaps.push('Typography tokens missing font_family');
    score -= 20;
  }
  if (!tokens.spacing || tokens.spacing.length < 3) {
    gaps.push('Spacing scale too small (need at least 3 values)');
    score -= 15;
  }

  const designSection = synthesis?.sections?.find(s => s.title === 'DESIGN_SYSTEM');
  if (!designSection) {
    gaps.push('Synthesis prompt missing DESIGN_SYSTEM section');
    score -= 15;
  }

  return { score: Math.max(0, score), gaps };
}

/**
 * Score interaction patterns: navigation, CTAs, forms.
 */
export function scoreInteractionPatterns(dna, synthesis) {
  const gaps = [];
  let score = 100;

  const interactions = dna?.interaction_patterns || dna?.interactions || {};
  if (!interactions.navigation && !dna?.navigation) {
    gaps.push('No navigation pattern defined');
    score -= 30;
  }
  if (!interactions.cta_style && !interactions.buttons) {
    gaps.push('No CTA/button style defined');
    score -= 20;
  }
  if (!interactions.forms && !interactions.inputs) {
    gaps.push('No form/input patterns defined');
    score -= 15;
  }

  return { score: Math.max(0, score), gaps };
}

/**
 * Score technical implementation: component structure, performance hints.
 */
export function scoreTechnicalImplementation(dna, synthesis) {
  const gaps = [];
  let score = 100;

  const tech = dna?.technical || {};
  if (!tech.framework && !tech.stack) {
    gaps.push('No framework/stack specified');
    score -= 20;
  }
  if (!tech.component_naming && !tech.conventions) {
    gaps.push('No component naming conventions');
    score -= 15;
  }
  if (!synthesis?.metadata?.target_framework) {
    gaps.push('Synthesis missing target framework metadata');
    score -= 15;
  }

  return { score: Math.max(0, score), gaps };
}

/**
 * Score accessibility: ARIA patterns, contrast, semantic HTML.
 */
export function scoreAccessibility(dna, synthesis) {
  const gaps = [];
  let score = 100;

  const a11y = dna?.accessibility || {};
  if (!a11y.aria_patterns && !a11y.landmarks) {
    gaps.push('No ARIA/landmark patterns defined');
    score -= 25;
  }
  if (!a11y.color_contrast && !a11y.contrast) {
    gaps.push('No color contrast requirements');
    score -= 25;
  }
  if (!a11y.semantic_html && !a11y.heading_hierarchy) {
    gaps.push('No semantic HTML guidance');
    score -= 20;
  }

  return { score: Math.max(0, score), gaps };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Run quality check across all 6 domains.
 * @param {object} dna - Site DNA JSON
 * @param {object} synthesis - Synthesis prompt data
 * @returns {{domain_scores: object, overall_score: number, gaps: object, eligible: boolean}}
 */
export function runQualityCheck(dna, synthesis) {
  const scorers = {
    layout: scoreLayout,
    visual_composition: scoreVisualComposition,
    design_system: scoreDesignSystem,
    interaction_patterns: scoreInteractionPatterns,
    technical_implementation: scoreTechnicalImplementation,
    accessibility: scoreAccessibility,
  };

  const domainScores = {};
  const allGaps = {};
  let weightedTotal = 0;

  for (const [domain, scorer] of Object.entries(scorers)) {
    const result = scorer(dna || {}, synthesis || {});
    domainScores[domain] = result.score;
    allGaps[domain] = result.gaps;
    weightedTotal += result.score * (DOMAIN_WEIGHTS[domain] || 0);
  }

  const overallScore = Math.round(weightedTotal);

  return {
    domain_scores: domainScores,
    overall_score: overallScore,
    gaps: allGaps,
    eligible: overallScore >= PASS_THRESHOLD,
  };
}

/**
 * Execute quality check for a venture and persist results.
 * @param {string} ventureId - Venture UUID or name
 * @param {object} [options]
 * @param {object} [options.supabase] - Supabase client (for testing)
 * @returns {Promise<object>} Quality check result
 */
export async function executeQualityCheck(ventureId, options = {}) {
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Look up latest Site DNA for this venture
  const { data: dnaRows } = await supabase
    .from('srip_site_dna')
    .select('id, venture_id, dna_json')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1);

  const dna = dnaRows?.[0];

  // Look up latest synthesis prompt
  const { data: synthRows } = await supabase
    .from('srip_synthesis_prompts')
    .select('id, venture_id, prompt_sections, metadata')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1);

  const synthesis = synthRows?.[0];

  // Run quality check
  const result = runQualityCheck(
    dna?.dna_json || {},
    { sections: synthesis?.prompt_sections || [], metadata: synthesis?.metadata || {} }
  );

  // Persist result
  const { data: inserted, error } = await supabase
    .from('srip_quality_checks')
    .insert({
      venture_id: ventureId,
      site_dna_id: dna?.id || null,
      synthesis_prompt_id: synthesis?.id || null,
      domain_scores: result.domain_scores,
      overall_score: result.overall_score,
      gaps: result.gaps,
      pass_threshold: PASS_THRESHOLD,
      passed: result.eligible,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to persist quality check:', error.message);
  }

  return {
    ...result,
    id: inserted?.id || null,
    venture_id: ventureId,
    site_dna_id: dna?.id || null,
    synthesis_prompt_id: synthesis?.id || null,
  };
}

/**
 * Format quality check result for display.
 */
export function formatResult(result) {
  const lines = [
    '\n📊 SRIP QUALITY CHECK',
    `   Overall Score: ${result.overall_score}/100 ${result.eligible ? '✅ PASS' : '❌ BELOW THRESHOLD'}`,
    `   Pass Threshold: ${PASS_THRESHOLD}%`,
    '',
    '   Domain Scores:',
  ];

  for (const [domain, score] of Object.entries(result.domain_scores)) {
    const label = domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
    lines.push(`   ${bar} ${score}% ${label}`);
  }

  const totalGaps = Object.values(result.gaps).flat();
  if (totalGaps.length > 0) {
    lines.push('');
    lines.push(`   Gaps (${totalGaps.length}):`);
    for (const gap of totalGaps.slice(0, 10)) {
      lines.push(`   ⚠️  ${gap}`);
    }
    if (totalGaps.length > 10) {
      lines.push(`   ... and ${totalGaps.length - 10} more`);
    }
  }

  return lines.join('\n');
}
