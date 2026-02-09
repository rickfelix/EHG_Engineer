/**
 * Context Analyzer for LEO Assist
 *
 * Analyzes recent SD work to provide context-aware prioritization
 * for feedback inbox processing.
 *
 * Part of SD-LEO-FIX-LEO-ASSIST-INTELLIGENT-002: /leo assist implementation
 *
 * @module lib/quality/context-analyzer
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Stop words to exclude from keyword extraction
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'this', 'that', 'these', 'those', 'it', 'its', 'through', 'via',
  'into', 'onto', 'upon', 'about', 'after', 'before', 'between',
  'under', 'over', 'above', 'below', 'up', 'down', 'out', 'off',
  'then', 'than', 'so', 'if', 'when', 'where', 'what', 'which', 'who',
  'how', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'just',
  'also', 'now', 'here', 'there', 'very', 'too', 'any', 'new', 'old'
]);

/**
 * Get recent SD context for prioritization
 *
 * Returns SDs that are:
 * - Currently being worked on (is_working_on = true)
 * - Recently modified (within last 7 days)
 * - In active phases (not completed/cancelled)
 *
 * @param {Object} [options] - Query options
 * @param {number} [options.daysBack=7] - How many days back to look
 * @param {number} [options.limit=10] - Maximum SDs to return
 * @returns {Promise<Object[]>} Recent SD context
 */
async function getRecentSDContext(options = {}) {
  const { daysBack = 7, limit = 10 } = options;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const { data: recentSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, description, sd_type, current_phase, updated_at, is_working_on')
    .or(`is_working_on.eq.true,updated_at.gte.${cutoffDate.toISOString()}`)
    .not('status', 'in', '(completed,cancelled)')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ContextAnalyzer] Error fetching recent SDs:', error.message);
    return [];
  }

  // Extract keywords for each SD
  return (recentSDs || []).map(sd => ({
    ...sd,
    keywords: extractKeywords(`${sd.title} ${sd.description || ''}`)
  }));
}

/**
 * Extract meaningful keywords from text
 *
 * @param {string} text - Text to extract keywords from
 * @param {number} [minLength=3] - Minimum word length
 * @returns {string[]} Array of lowercase keywords
 */
function extractKeywords(text, minLength = 3) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')  // Remove special chars except hyphens
    .split(/\s+/)
    .filter(word => word.length >= minLength)
    .filter(word => !STOP_WORDS.has(word))
    .filter((word, index, self) => self.indexOf(word) === index);  // Dedupe
}

/**
 * Find related SD for a feedback item
 *
 * Checks if the feedback item's title/description contains
 * keywords from recent SD work.
 *
 * @param {Object} item - Feedback item
 * @param {Object[]} recentSDs - Recent SDs with keywords
 * @returns {Object|null} Related SD or null
 */
function findRelatedSD(item, recentSDs) {
  if (!item || !recentSDs || recentSDs.length === 0) {
    return null;
  }

  const itemText = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  const itemKeywords = extractKeywords(itemText);

  let bestMatch = null;
  let bestScore = 0;

  for (const sd of recentSDs) {
    const score = scoreRelevance(itemKeywords, sd.keywords);

    // Boost score if SD is currently being worked on
    const adjustedScore = sd.is_working_on ? score * 1.5 : score;

    if (adjustedScore > bestScore && adjustedScore >= 0.2) {  // Minimum threshold
      bestScore = adjustedScore;
      bestMatch = {
        sd,
        score: adjustedScore,
        matchedKeywords: itemKeywords.filter(kw => sd.keywords.includes(kw))
      };
    }
  }

  return bestMatch;
}

/**
 * Score relevance between two keyword sets
 *
 * Uses Jaccard similarity with weighting for important terms
 *
 * @param {string[]} keywords1 - First keyword set
 * @param {string[]} keywords2 - Second keyword set
 * @returns {number} Relevance score between 0 and 1
 */
function scoreRelevance(keywords1, keywords2) {
  if (!keywords1.length || !keywords2.length) {
    return 0;
  }

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  // Count intersection
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) {
      intersection++;
    }
  }

  if (intersection === 0) {
    return 0;
  }

  // Jaccard similarity: intersection / union
  const union = new Set([...set1, ...set2]).size;
  return intersection / union;
}

/**
 * Build context for assist mode
 *
 * Combines recent SD context with analysis helpers
 *
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Full context object
 */
async function buildAssistContext(options = {}) {
  const recentSDs = await getRecentSDContext(options);

  // Find the primary working SD
  const workingSD = recentSDs.find(sd => sd.is_working_on);

  // Get recently modified files from git (for additional context)
  // This could be expanded in the future

  return {
    recentSDs,
    workingSD,
    sdCount: recentSDs.length,
    hasActiveWork: !!workingSD,

    // Helper functions bound to this context
    findRelated: (item) => findRelatedSD(item, recentSDs),

    // Summary for display
    summary: workingSD
      ? `Currently working on: ${workingSD.sd_key} - ${workingSD.title}`
      : `${recentSDs.length} SDs modified in last 7 days`
  };
}

/**
 * Generate AI recommendation for an enhancement
 *
 * @param {Object} enhancement - The enhancement feedback item
 * @param {Object} context - Context from buildAssistContext
 * @param {Object[]} [recentlyFixed] - Issues fixed in this session
 * @returns {string} Recommendation text
 */
function generateRecommendation(enhancement, context, recentlyFixed = []) {
  const related = context.findRelated(enhancement);

  // Check if related to recently fixed issues
  if (recentlyFixed && recentlyFixed.length > 0) {
    const relatedIssue = recentlyFixed.find(issue => {
      const issueKeywords = extractKeywords(`${issue.title} ${issue.description || ''}`);
      const enhKeywords = extractKeywords(`${enhancement.title} ${enhancement.description || ''}`);
      return scoreRelevance(issueKeywords, enhKeywords) >= 0.2;
    });

    if (relatedIssue) {
      return `Related to "${relatedIssue.title}" which you just fixed. Good time to implement while context is fresh.`;
    }
  }

  // Check if related to active SD work
  if (related && related.sd) {
    const sdRef = related.sd.sd_key || related.sd.id;
    if (related.sd.is_working_on) {
      return `Related to SD "${sdRef}" you're currently working on. Consider implementing together.`;
    }
    return `Related to recent SD "${sdRef}". Matched keywords: ${related.matchedKeywords.join(', ')}.`;
  }

  // Check effort estimate
  if (enhancement.effort_estimate === 'small' || enhancement.estimated_loc <= 30) {
    return `Low effort (~${enhancement.estimated_loc || 30} LOC). Quick win opportunity.`;
  }

  return 'No direct relationship to recent work. Consider for future sprint based on priority.';
}

/**
 * Verification lens types
 * SD-LEO-FEAT-CLARIFY-VERIFICATION-TAXONOMY-001 (FR-4)
 */
const VERIFICATION_LENS = {
  TRIANGULATION: 'TRIANGULATION',  // Codebase-aware, semi-manual ("Is it real?")
  DEBATE: 'DEBATE',                // API-only, automated multi-model ("Should we do it?")
  RESEARCH: 'RESEARCH'             // API-only, deep exploration ("What's the best way?")
};

// Keywords that signal implementation claims → TRIANGULATION
const TRIANGULATION_KEYWORDS = [
  'already implemented', 'already exists', 'in the repo', 'in the codebase',
  'endpoint', 'api route', 'function', 'component', 'module', 'class',
  'file', 'migration', 'table', 'column', 'schema', 'database',
  'stack trace', 'error at', 'line ', 'import', 'require',
  'is broken', 'is missing', 'not working', 'bug in', 'fails when',
  'check if', 'verify that', 'does it exist', 'is it implemented'
];

// Keywords that signal proposal evaluation → DEBATE
const DEBATE_KEYWORDS = [
  'proposal', 'should we', 'pros and cons', 'trade-off', 'tradeoff',
  'evaluate', 'assess', 'review this idea', 'is it worth',
  'good idea', 'bad idea', 'recommend', 'advisable',
  'add rate limiting', 'add caching', 'add logging',
  'change the approach', 'switch to', 'migrate to',
  'approve', 'reject', 'decision needed'
];

// Keywords that signal exploration → RESEARCH
const RESEARCH_KEYWORDS = [
  'best approach', 'best practice', 'options for', 'alternatives',
  'compare', 'comparison', 'which framework', 'which library',
  'how should we', 'what are the ways', 'explore',
  'state of the art', 'industry standard', 'benchmark',
  'deep dive', 'research', 'investigate approaches',
  'redis vs', 'postgres vs', 'react vs', 'vs '
];

/**
 * Classify a feedback item into a verification lens
 *
 * Determines which verification tool (Triangulation, Debate, or Research)
 * is most appropriate for evaluating a feedback item.
 *
 * SD-LEO-FEAT-CLARIFY-VERIFICATION-TAXONOMY-001 (FR-4)
 *
 * @param {Object} item - Feedback item with title/description
 * @param {Object} [options] - Classification options
 * @param {string} [options.lensOverride] - Manual override (TRIANGULATION|DEBATE|RESEARCH)
 * @returns {{ lens: string, confidence: number, reason: string, override?: string }}
 */
function classifyVerificationLens(item, options = {}) {
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();

  // Handle manual override
  if (options.lensOverride && Object.values(VERIFICATION_LENS).includes(options.lensOverride)) {
    const original = _classifyFromText(text);
    return {
      lens: options.lensOverride,
      confidence: 1.0,
      reason: `Manual override (original: ${original.lens})`,
      original_lens: original.lens,
      override_lens: options.lensOverride
    };
  }

  return _classifyFromText(text);
}

/**
 * Internal classification from text content
 * @private
 */
function _classifyFromText(text) {
  // Score each lens
  const triScore = _scoreKeywords(text, TRIANGULATION_KEYWORDS);
  const debateScore = _scoreKeywords(text, DEBATE_KEYWORDS);
  const researchScore = _scoreKeywords(text, RESEARCH_KEYWORDS);

  const maxScore = Math.max(triScore, debateScore, researchScore);

  // No strong signal → default to DEBATE (safest general evaluation)
  if (maxScore === 0) {
    return {
      lens: VERIFICATION_LENS.DEBATE,
      confidence: 0.4,
      reason: 'No strong keyword signal; defaulting to debate evaluation'
    };
  }

  // Determine winner with confidence based on margin
  const scores = [
    { lens: VERIFICATION_LENS.TRIANGULATION, score: triScore, label: 'implementation claim' },
    { lens: VERIFICATION_LENS.DEBATE, score: debateScore, label: 'proposal evaluation' },
    { lens: VERIFICATION_LENS.RESEARCH, score: researchScore, label: 'exploratory question' }
  ].sort((a, b) => b.score - a.score);

  const winner = scores[0];
  const runnerUp = scores[1];

  // Confidence: how much the winner leads over runner-up
  const margin = winner.score - runnerUp.score;
  const confidence = Math.min(0.95, 0.5 + (margin * 0.15));

  return {
    lens: winner.lens,
    confidence: Math.round(confidence * 100) / 100,
    reason: `${winner.label} (${winner.score} keyword matches)`
  };
}

/**
 * Score text against a keyword list
 * @private
 */
function _scoreKeywords(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) score++;
  }
  return score;
}

/**
 * Estimate LOC for a feedback item based on description
 *
 * Simple heuristic estimation - can be refined later
 *
 * @param {Object} item - Feedback item
 * @returns {number} Estimated lines of code
 */
function estimateLOC(item) {
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();

  // Keywords suggesting larger scope
  const largeKeywords = ['refactor', 'redesign', 'overhaul', 'system', 'architecture', 'migrate'];
  const mediumKeywords = ['add', 'implement', 'create', 'build', 'feature', 'component'];
  const smallKeywords = ['fix', 'update', 'change', 'tweak', 'adjust', 'typo', 'text'];

  if (largeKeywords.some(kw => text.includes(kw))) {
    return 150;  // Likely needs SD
  }

  if (mediumKeywords.some(kw => text.includes(kw))) {
    return 60;  // Borderline - might need SD
  }

  if (smallKeywords.some(kw => text.includes(kw))) {
    return 25;  // Quick fix territory
  }

  // Default to medium
  return 50;
}

// Named exports
export {
  getRecentSDContext,
  extractKeywords,
  findRelatedSD,
  scoreRelevance,
  buildAssistContext,
  generateRecommendation,
  estimateLOC,
  classifyVerificationLens,
  VERIFICATION_LENS,
  STOP_WORDS
};

// Default export
export default {
  getRecentSDContext,
  extractKeywords,
  findRelatedSD,
  scoreRelevance,
  buildAssistContext,
  generateRecommendation,
  estimateLOC,
  classifyVerificationLens,
  VERIFICATION_LENS
};
