/**
 * SRIP Quality Check Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-D
 *
 * Stage 4 of the SRIP pipeline: Quality Check
 * Evaluates a synthesis prompt across 6 design domains and records
 * a pass/fail result in srip_quality_checks.
 *
 * Domains: layout, visual_composition, design_system, interaction, technical, accessibility
 *
 * Input: synthesisPromptId
 * Output: Quality check record stored in srip_quality_checks
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PASS_THRESHOLD = 70;

// ============================================================================
// Keyword / Section Detection Helpers
// ============================================================================

/**
 * Count how many keywords from a list appear in the text (case-insensitive).
 * Returns { found: string[], missing: string[] }.
 */
function checkKeywords(text, keywords) {
  const lower = (text || '').toLowerCase();
  const found = [];
  const missing = [];
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      found.push(kw);
    } else {
      missing.push(kw);
    }
  }
  return { found, missing };
}

/**
 * Score based on keyword presence. Returns 0-100.
 */
function keywordScore(found, total) {
  if (total === 0) return 0;
  return Math.round((found / total) * 100);
}

// ============================================================================
// Domain Scorers
// ============================================================================

const LAYOUT_KEYWORDS = [
  'grid', 'flexbox', 'css-grid', 'layout',
  'section', 'column', 'row',
  'responsive', 'mobile', 'desktop', 'breakpoint',
  'header', 'footer', 'hero', 'sidebar',
];

/**
 * Score layout specifications in the prompt text.
 * Checks for grid/flex systems, sections, responsive mentions.
 */
export function scoreLayout(promptText, _dnaJson) {
  const { found, missing } = checkKeywords(promptText, LAYOUT_KEYWORDS);
  const gaps = [];
  if (!found.some(k => ['grid', 'flexbox', 'css-grid'].includes(k))) {
    gaps.push('No grid system specified (grid, flexbox, or css-grid)');
  }
  if (!found.some(k => ['section', 'header', 'footer', 'hero', 'sidebar'].includes(k))) {
    gaps.push('No page sections defined (header, footer, hero, sidebar)');
  }
  if (!found.some(k => ['responsive', 'mobile', 'desktop', 'breakpoint'].includes(k))) {
    gaps.push('No responsive strategy mentioned');
  }
  const score = keywordScore(found.length, LAYOUT_KEYWORDS.length);
  return { score, gaps };
}

const VISUAL_COMPOSITION_KEYWORDS = [
  'hierarchy', 'focal', 'contrast',
  'whitespace', 'spacing', 'padding', 'margin',
  'alignment', 'center', 'left-aligned', 'right-aligned',
  'visual rhythm', 'composition', 'weight',
];

/**
 * Score visual composition quality in the prompt text.
 * Checks for visual hierarchy, whitespace, alignment.
 */
export function scoreVisualComposition(promptText, _dnaJson) {
  const { found, missing } = checkKeywords(promptText, VISUAL_COMPOSITION_KEYWORDS);
  const gaps = [];
  if (!found.some(k => ['hierarchy', 'focal', 'weight'].includes(k))) {
    gaps.push('No visual hierarchy or focal point defined');
  }
  if (!found.some(k => ['whitespace', 'spacing', 'padding', 'margin'].includes(k))) {
    gaps.push('No whitespace or spacing strategy specified');
  }
  if (!found.some(k => ['alignment', 'center', 'left-aligned', 'right-aligned'].includes(k))) {
    gaps.push('No alignment approach specified');
  }
  const score = keywordScore(found.length, VISUAL_COMPOSITION_KEYWORDS.length);
  return { score, gaps };
}

const DESIGN_SYSTEM_KEYWORDS = [
  'color', 'primary', 'secondary', 'accent', 'background',
  'font', 'typography', 'size', 'weight',
  'spacing', 'border', 'radius', 'shadow',
  'token', 'design system',
];

/**
 * Score design system / design token coverage.
 * Checks for colors, typography, spacing tokens.
 */
export function scoreDesignSystem(promptText, _dnaJson) {
  const { found, missing } = checkKeywords(promptText, DESIGN_SYSTEM_KEYWORDS);
  const gaps = [];
  if (!found.some(k => ['color', 'primary', 'secondary', 'accent', 'background'].includes(k))) {
    gaps.push('No color tokens defined');
  }
  if (!found.some(k => ['font', 'typography', 'size', 'weight'].includes(k))) {
    gaps.push('No typography tokens defined');
  }
  if (!found.some(k => ['spacing', 'border', 'radius', 'shadow'].includes(k))) {
    gaps.push('No spacing or shape tokens defined');
  }
  const score = keywordScore(found.length, DESIGN_SYSTEM_KEYWORDS.length);
  return { score, gaps };
}

const INTERACTION_KEYWORDS = [
  'button', 'input', 'form', 'modal', 'tooltip', 'accordion', 'dropdown',
  'hover', 'active', 'focus', 'disabled', 'state',
  'animation', 'transition', 'motion',
  'click', 'component', 'interactive',
];

/**
 * Score interaction / component behavior specifications.
 * Checks for component types, states, animations.
 */
export function scoreInteraction(promptText, _dnaJson) {
  const { found, missing } = checkKeywords(promptText, INTERACTION_KEYWORDS);
  const gaps = [];
  if (!found.some(k => ['button', 'input', 'form', 'modal', 'tooltip', 'accordion', 'dropdown'].includes(k))) {
    gaps.push('No interactive components specified');
  }
  if (!found.some(k => ['hover', 'active', 'focus', 'disabled', 'state'].includes(k))) {
    gaps.push('No component states defined (hover, active, focus, disabled)');
  }
  if (!found.some(k => ['animation', 'transition', 'motion'].includes(k))) {
    gaps.push('No animation or transition behavior specified');
  }
  const score = keywordScore(found.length, INTERACTION_KEYWORDS.length);
  return { score, gaps };
}

const TECHNICAL_KEYWORDS = [
  'react', 'vue', 'angular', 'svelte', 'next.js', 'framework',
  'tailwind', 'css', 'sass', 'styled', 'module',
  'vite', 'webpack', 'build',
  'ssr', 'ssg', 'csr', 'rendering',
  'typescript', 'javascript',
];

/**
 * Score technical implementation specifications.
 * Checks for framework, CSS approach, build tool references.
 */
export function scoreTechnical(promptText, _dnaJson) {
  const { found, missing } = checkKeywords(promptText, TECHNICAL_KEYWORDS);
  const gaps = [];
  if (!found.some(k => ['react', 'vue', 'angular', 'svelte', 'next.js', 'framework'].includes(k))) {
    gaps.push('No frontend framework specified');
  }
  if (!found.some(k => ['tailwind', 'css', 'sass', 'styled', 'module'].includes(k))) {
    gaps.push('No CSS approach specified');
  }
  if (!found.some(k => ['vite', 'webpack', 'build'].includes(k))) {
    gaps.push('No build tool specified');
  }
  const score = keywordScore(found.length, TECHNICAL_KEYWORDS.length);
  return { score, gaps };
}

const ACCESSIBILITY_KEYWORDS = [
  'alt', 'alt text', 'aria', 'role', 'label',
  'contrast', 'wcag', 'a11y', 'accessible',
  'keyboard', 'tab', 'focus', 'screen reader',
  'semantic', 'landmark',
];

/**
 * Score accessibility coverage in the prompt.
 * Checks for alt text, contrast, keyboard navigation mentions.
 */
export function scoreAccessibility(promptText, _dnaJson) {
  const { found, missing } = checkKeywords(promptText, ACCESSIBILITY_KEYWORDS);
  const gaps = [];
  if (!found.some(k => ['alt', 'alt text', 'aria', 'role', 'label'].includes(k))) {
    gaps.push('No alt text or ARIA attributes mentioned');
  }
  if (!found.some(k => ['contrast', 'wcag', 'a11y', 'accessible'].includes(k))) {
    gaps.push('No contrast or WCAG compliance mentioned');
  }
  if (!found.some(k => ['keyboard', 'tab', 'focus', 'screen reader'].includes(k))) {
    gaps.push('No keyboard navigation or screen reader support mentioned');
  }
  const score = keywordScore(found.length, ACCESSIBILITY_KEYWORDS.length);
  return { score, gaps };
}

// ============================================================================
// Domain Registry
// ============================================================================

const DOMAIN_SCORERS = [
  { key: 'layout', fn: scoreLayout },
  { key: 'visual_composition', fn: scoreVisualComposition },
  { key: 'design_system', fn: scoreDesignSystem },
  { key: 'interaction', fn: scoreInteraction },
  { key: 'technical', fn: scoreTechnical },
  { key: 'accessibility', fn: scoreAccessibility },
];

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run quality check on a synthesis prompt across all 6 domains.
 *
 * @param {object} params
 * @param {string} params.synthesisPromptId - UUID of the srip_synthesis_prompts record
 * @param {object} [params.supabase] - Optional Supabase client
 * @returns {object|null} The quality check record, or null on failure
 */
export async function runQualityCheck({ synthesisPromptId, supabase }) {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  console.log('\n   SRIP Quality Check');
  console.log(`   Synthesis Prompt: ${synthesisPromptId}`);

  // Load synthesis prompt
  const { data: prompt, error: promptError } = await supabase
    .from('srip_synthesis_prompts')
    .select('id, venture_id, site_dna_id, prompt_text, fidelity_target, status')
    .eq('id', synthesisPromptId)
    .single();

  if (promptError || !prompt) {
    console.error(`   Synthesis prompt not found: ${promptError?.message || 'no data'}`);
    return null;
  }

  // Load linked site DNA for reference comparison
  let dnaJson = {};
  if (prompt.site_dna_id) {
    const { data: siteDna, error: dnaError } = await supabase
      .from('srip_site_dna')
      .select('id, dna_json')
      .eq('id', prompt.site_dna_id)
      .single();

    if (!dnaError && siteDna) {
      dnaJson = siteDna.dna_json || {};
    }
  }

  const promptText = prompt.prompt_text || '';
  console.log(`   Prompt length: ${promptText.length} chars`);
  console.log(`   Fidelity target: ${prompt.fidelity_target || 'N/A'}%`);

  // Run all 6 domain scorers
  const domainScores = {};
  const allGaps = [];

  for (const { key, fn } of DOMAIN_SCORERS) {
    const result = fn(promptText, dnaJson);
    domainScores[key] = result.score;
    if (result.gaps.length > 0) {
      for (const gap of result.gaps) {
        allGaps.push({ domain: key, gap });
      }
    }
    console.log(`   ${key}: ${result.score}/100${result.gaps.length > 0 ? ` (${result.gaps.length} gaps)` : ''}`);
  }

  // Calculate overall score as average of 6 domains
  const scores = Object.values(domainScores);
  const overallScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);

  console.log(`\n   Overall: ${overallScore}/100 | Threshold: ${DEFAULT_PASS_THRESHOLD}`);
  console.log(`   Result: ${overallScore >= DEFAULT_PASS_THRESHOLD ? 'PASS' : 'FAIL'}`);
  console.log(`   Total gaps: ${allGaps.length}`);

  // Store in database
  const checkRecord = {
    venture_id: prompt.venture_id || null,
    synthesis_prompt_id: synthesisPromptId,
    domain_scores: domainScores,
    overall_score: overallScore,
    gaps: allGaps,
    pass_threshold: DEFAULT_PASS_THRESHOLD,
    created_by: 'SRIP_QUALITY_CHECK',
  };

  const { data, error } = await supabase
    .from('srip_quality_checks')
    .insert(checkRecord)
    .select('id, venture_id, overall_score, pass_threshold, domain_scores, gaps, created_at');

  if (error) {
    console.error(`   DB insert failed: ${error.message}`);
    return null;
  }

  const result = data[0];
  console.log(`\n   Quality check stored: ${result.id}`);

  return result;
}
