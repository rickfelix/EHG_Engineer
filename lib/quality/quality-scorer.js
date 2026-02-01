/**
 * Quality Scorer
 * SD-LEO-SELF-IMPROVE-001C - Phase 1: Feedback Quality Layer
 *
 * Calculates quality scores for feedback items using dimension-based scoring.
 * Dimensions: clarity, actionability, specificity, relevance, completeness
 *
 * @module lib/quality/quality-scorer
 */

import { loadConfig } from './sanitizer.js';

/**
 * Score clarity of feedback content
 * Measures how clearly the issue/request is communicated
 * @param {Object} feedback - Feedback item
 * @returns {number} Score 0-100
 */
function scoreClarity(feedback) {
  let score = 50; // Base score
  const title = feedback.title || '';
  const description = feedback.description || '';

  // Title quality
  if (title.length > 10 && title.length < 100) score += 10;
  if (title.length >= 5 && title.length <= 10) score += 5;
  if (!/^[a-z]/.test(title) && title.length > 0) score += 5; // Starts with capital
  if (!/[?!]+$/.test(title)) score += 5; // Not ending with excessive punctuation

  // Description quality
  if (description.length > 50) score += 10;
  if (description.length > 200) score += 10;
  if (description.includes('\n')) score += 5; // Has structure

  // Penalty for unclear signals
  if (/^(help|broken|fix|error|issue|bug|problem)$/i.test(title.trim())) score -= 20;
  if (title.includes('!!!') || title.includes('???')) score -= 10;
  if (description.length < 20) score -= 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score actionability of feedback
 * Measures whether the feedback provides enough info to act on
 * @param {Object} feedback - Feedback item
 * @returns {number} Score 0-100
 */
function scoreActionability(feedback) {
  let score = 40; // Base score
  const description = feedback.description || '';
  const metadata = feedback.metadata || {};

  // Has context about where it happened
  if (feedback.source_url || feedback.source_type) score += 10;
  if (feedback.error_type) score += 15;

  // Has stack trace or technical details
  if (description.includes('stack') || description.includes('Error:')) score += 15;
  if (description.includes('at ') && description.includes('.js')) score += 10;

  // Has reproduction information
  if (/steps to reproduce|how to|when I|after I|before I/i.test(description)) score += 15;

  // Has file or line references
  if (/\.(js|ts|jsx|tsx|md|json)/.test(description)) score += 10;
  if (/line \d+|:\d+:\d+/.test(description)) score += 10;

  // Metadata richness
  if (Object.keys(metadata).length > 3) score += 10;

  // Penalty for vague content
  if (/doesn't work|not working|broken|help me/i.test(description) && description.length < 100) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score specificity of feedback
 * Measures how specific vs vague the feedback is
 * @param {Object} feedback - Feedback item
 * @returns {number} Score 0-100
 */
function scoreSpecificity(feedback) {
  let score = 40; // Base score
  const description = feedback.description || '';
  const title = feedback.title || '';

  // Specific identifiers
  if (/SD-[A-Z]+-\d+|QF-[A-Z0-9-]+/.test(title + description)) score += 15;
  if (/[a-zA-Z_$][a-zA-Z0-9_$]*\(/.test(description)) score += 10; // Function names
  if (/"[^"]{2,50}"/.test(description)) score += 10; // Quoted strings

  // Numbers and specific values
  if (/\d+/.test(description)) score += 5;
  if (/expected.*actual|got.*wanted|should.*but/i.test(description)) score += 15;

  // Specific error messages
  if (/Error:|TypeError:|ReferenceError:|SyntaxError:/i.test(description)) score += 15;

  // File paths
  if (/\/?[a-zA-Z_-]+\/[a-zA-Z_-]+/.test(description)) score += 10;

  // Penalty for vague language
  const vagueTerms = ['sometimes', 'usually', 'often', 'maybe', 'might', 'could be', 'something'];
  for (const term of vagueTerms) {
    if (description.toLowerCase().includes(term)) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score relevance of feedback
 * Measures alignment with project context
 * @param {Object} feedback - Feedback item
 * @returns {number} Score 0-100
 */
function scoreRelevance(feedback) {
  let score = 60; // Base score - assume feedback submitted is relevant
  const description = feedback.description || '';
  const title = feedback.title || '';
  const source = feedback.source_application || '';
  const combinedText = (title + ' ' + description).toLowerCase();

  // Project-relevant terms
  const relevantTerms = [
    'leo', 'protocol', 'sd', 'strategic directive', 'handoff',
    'supabase', 'feedback', 'quality', 'ehg', 'engineer',
    'claude', 'agent', 'sub-agent', 'validation', 'gate'
  ];

  for (const term of relevantTerms) {
    if (combinedText.includes(term)) score += 5;
  }

  // Source application match
  if (source === 'EHG_Engineer') score += 15;
  if (source && source.length > 0) score += 5;

  // Penalty for off-topic indicators
  const offTopicTerms = ['unrelated', 'off topic', 'wrong project', 'not about'];
  for (const term of offTopicTerms) {
    if (combinedText.includes(term)) score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score completeness of feedback
 * Measures whether all expected information is present
 * @param {Object} feedback - Feedback item
 * @returns {number} Score 0-100
 */
function scoreCompleteness(feedback) {
  let score = 30; // Start low, add for completeness

  // Required fields presence
  if (feedback.title && feedback.title.length > 0) score += 15;
  if (feedback.description && feedback.description.length > 0) score += 15;
  if (feedback.type) score += 10;
  if (feedback.severity) score += 10;

  // Optional but valuable fields
  if (feedback.source_type) score += 5;
  if (feedback.source_url) score += 5;
  if (feedback.error_type) score += 5;
  if (feedback.priority) score += 5;

  // Rich metadata
  const metadata = feedback.metadata || {};
  const metadataKeys = Object.keys(metadata).length;
  if (metadataKeys > 0) score += 5;
  if (metadataKeys > 3) score += 5;
  if (metadataKeys > 5) score += 5;

  // Description richness
  const description = feedback.description || '';
  if (description.length > 100) score += 5;
  if (description.length > 300) score += 5;
  if (description.includes('\n\n')) score += 5; // Has paragraphs

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate overall quality score for feedback
 * @param {Object} feedback - Feedback item to score
 * @param {Object} options - Scoring options
 * @param {Object} options.weights - Custom weights (overrides config)
 * @returns {Promise<Object>} Quality score result
 */
export async function calculateQualityScore(feedback, options = {}) {
  const startTime = Date.now();

  // Get weights from config or options
  let weights;
  if (options.weights) {
    weights = options.weights;
  } else {
    try {
      const config = await loadConfig();
      weights = config.scoring_weights;
    } catch {
      // Default weights if config unavailable
      weights = {
        clarity: 0.25,
        actionability: 0.25,
        specificity: 0.20,
        relevance: 0.15,
        completeness: 0.15
      };
    }
  }

  // Calculate dimension scores
  const dimensions = {
    clarity: scoreClarity(feedback),
    actionability: scoreActionability(feedback),
    specificity: scoreSpecificity(feedback),
    relevance: scoreRelevance(feedback),
    completeness: scoreCompleteness(feedback)
  };

  // Calculate weighted total
  let totalScore = 0;
  const breakdown = {};

  for (const [dimension, weight] of Object.entries(weights)) {
    const dimScore = dimensions[dimension] || 0;
    const contribution = dimScore * weight;
    totalScore += contribution;
    breakdown[dimension] = {
      raw: dimScore,
      weight,
      contribution: Math.round(contribution * 100) / 100
    };
  }

  // Round to integer
  const finalScore = Math.round(totalScore);

  return {
    score: finalScore,
    dimensions,
    breakdown,
    weights,
    processing_time_ms: Date.now() - startTime
  };
}

/**
 * Determine quality tier based on score
 * @param {number} score - Quality score (0-100)
 * @param {Object} thresholds - Threshold configuration
 * @returns {string} Quality tier: 'high', 'medium', 'low'
 */
export function getQualityTier(score, thresholds = {}) {
  const lowThreshold = thresholds.lowQualityThreshold || 30;
  const highThreshold = thresholds.highQualityThreshold || 70;

  if (score >= highThreshold) return 'high';
  if (score >= lowThreshold) return 'medium';
  return 'low';
}

/**
 * Generate improvement suggestions based on dimension scores
 * @param {Object} dimensions - Dimension scores
 * @returns {Array<string>} List of improvement suggestions
 */
export function generateImprovementSuggestions(dimensions) {
  const suggestions = [];
  const threshold = 50; // Below this, suggest improvement

  if (dimensions.clarity < threshold) {
    suggestions.push('Add a clearer, more descriptive title');
    if (dimensions.clarity < 30) {
      suggestions.push('Provide more detail in the description');
    }
  }

  if (dimensions.actionability < threshold) {
    suggestions.push('Include steps to reproduce the issue');
    suggestions.push('Add error messages or stack traces if available');
  }

  if (dimensions.specificity < threshold) {
    suggestions.push('Reference specific files, functions, or components');
    suggestions.push('Include expected vs actual behavior');
  }

  if (dimensions.relevance < threshold) {
    suggestions.push('Clarify which part of the system this relates to');
  }

  if (dimensions.completeness < threshold) {
    suggestions.push('Fill in severity and type fields');
    suggestions.push('Add context about when/where this occurred');
  }

  return suggestions;
}

/**
 * Quick quality assessment without full scoring
 * @param {Object} feedback - Feedback to assess
 * @returns {{ isLowQuality: boolean, primaryIssue: string | null }}
 */
export function quickQualityCheck(feedback) {
  const title = feedback.title || '';
  const description = feedback.description || '';

  // Obvious low quality indicators
  if (title.length < 5) {
    return { isLowQuality: true, primaryIssue: 'Title too short' };
  }

  if (!description || description.length < 10) {
    return { isLowQuality: true, primaryIssue: 'Missing or insufficient description' };
  }

  if (/^(help|fix|broken|error|bug)$/i.test(title.trim())) {
    return { isLowQuality: true, primaryIssue: 'Generic title without context' };
  }

  return { isLowQuality: false, primaryIssue: null };
}

// Export default for CommonJS compatibility
export default {
  calculateQualityScore,
  getQualityTier,
  generateImprovementSuggestions,
  quickQualityCheck
};
