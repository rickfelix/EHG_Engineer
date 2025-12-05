/**
 * USER STORY QUALITY VALIDATION MODULE (AI-POWERED)
 *
 * Uses AI-powered Russian Judge multi-criterion weighted scoring to validate
 * user story quality during PLAN→EXEC handoff.
 *
 * Replaced keyword/pattern-based validation with semantic AI evaluation using gpt-5-mini.
 * All assessments stored in ai_quality_assessments table for meta-analysis.
 *
 * @module user-story-quality-validation
 * @version 2.0.0 (AI-powered Russian Judge)
 * @see /database/migrations/20251205_ai_quality_assessments.sql
 */

import { UserStoryQualityRubric } from './rubrics/user-story-quality-rubric.js';

// ============================================
// LEGACY BOILERPLATE PATTERNS (kept for backward compat)
// ============================================

// Known boilerplate patterns to flag
const BOILERPLATE_AC = [
  'implementation verified through unit tests',
  'e2e test validates user-facing behavior',
  'no regressions in related functionality',
  'all acceptance criteria met',
  'code review completed',
  'documentation updated'
];

const BOILERPLATE_TITLES = [
  'implement undefined',
  'implement feature',
  'create component',
  'add functionality'
];

const GENERIC_ROLES = ['user', 'developer', 'admin', 'system'];

const GENERIC_BENEFITS = [
  'improve the system',
  'enhance functionality',
  'better user experience',
  'meet requirements',
  'have this capability'
];

/**
 * Validate a single user story for quality using AI-powered Russian Judge rubric
 * @param {Object} story - User story object from database
 * @returns {Promise<Object>} { valid: boolean, passed: boolean, issues: array, warnings: array, score: number }
 */
export async function validateUserStoryQuality(story) {
  const storyKey = story?.story_key || story?.id || 'Unknown';

  // Basic presence check (fast-fail before AI call)
  if (!story || Object.keys(story).length === 0) {
    return {
      story_key: storyKey,
      valid: false,
      passed: false,
      score: 0,
      issues: [`${storyKey}: User story is empty or missing`],
      warnings: []
    };
  }

  try {
    // Use AI-powered Russian Judge rubric
    const rubric = new UserStoryQualityRubric();
    const result = await rubric.validateUserStoryQuality(story);

    // Convert to legacy format for backward compatibility
    return {
      story_key: storyKey,
      valid: result.passed,
      passed: result.passed,
      score: result.score,
      issues: result.issues,
      warnings: result.warnings,
      details: result.details
    };
  } catch (error) {
    console.error(`User Story Quality Validation Error (${storyKey}):`, error.message);

    // Fallback: return failed validation with error details
    return {
      story_key: storyKey,
      valid: false,
      passed: false,
      score: 0,
      issues: [`AI quality assessment failed: ${error.message}. Manual review required.`],
      warnings: ['OpenAI API error - check OPENAI_API_KEY environment variable'],
      details: {
        error: error.message
      }
    };
  }
}

/**
 * Validate all user stories for an SD
 * @param {Array} stories - Array of user story objects
 * @param {Object} options - Validation options
 * @param {number} options.minimumScore - Minimum average score required (default: 70)
 * @param {number} options.minimumStories - Minimum number of stories required (default: 1)
 * @param {boolean} options.blockOnWarnings - Whether to block on warnings (default: false)
 * @returns {Promise<Object>} Validation result (async now - calls AI)
 */
export async function validateUserStoriesForHandoff(stories, options = {}) {
  const {
    minimumScore = 70,
    minimumStories = 1,
    blockOnWarnings = false
  } = options;

  const result = {
    valid: true,
    totalStories: stories.length,
    validatedStories: 0,
    averageScore: 0,
    minimumScore,
    issues: [],
    warnings: [],
    storyResults: [],
    boilerplateCount: 0,
    qualityDistribution: {
      excellent: 0,  // 90-100
      good: 0,       // 80-89
      acceptable: 0, // 70-79
      poor: 0        // <70
    }
  };

  // Check minimum stories
  if (stories.length < minimumStories) {
    result.valid = false;
    result.issues.push(`Insufficient user stories: ${stories.length}/${minimumStories} required`);
    return result;
  }

  // Validate each story (async now)
  let totalScore = 0;

  for (const story of stories) {
    const storyResult = await validateUserStoryQuality(story);
    result.storyResults.push(storyResult);
    result.validatedStories++;
    totalScore += storyResult.score;

    // Collect issues and warnings
    result.issues.push(...storyResult.issues);
    result.warnings.push(...storyResult.warnings);

    // Track quality distribution
    if (storyResult.score >= 90) result.qualityDistribution.excellent++;
    else if (storyResult.score >= 80) result.qualityDistribution.good++;
    else if (storyResult.score >= 70) result.qualityDistribution.acceptable++;
    else result.qualityDistribution.poor++;

    // Count boilerplate
    if (storyResult.issues.some(i => i.includes('boilerplate'))) {
      result.boilerplateCount++;
    }
  }

  // Calculate average score
  result.averageScore = Math.round(totalScore / stories.length);

  // Determine overall validity
  if (result.issues.length > 0) {
    result.valid = false;
  }

  if (result.averageScore < minimumScore) {
    result.valid = false;
    result.issues.push(`Average user story quality score (${result.averageScore}%) is below minimum (${minimumScore}%)`);
  }

  if (blockOnWarnings && result.warnings.length > 0) {
    result.valid = false;
  }

  // Generate summary
  result.summary = generateValidationSummary(result);

  return result;
}

/**
 * Generate human-readable validation summary
 */
function generateValidationSummary(result) {
  const lines = [];

  lines.push('📊 User Story Quality Validation');
  lines.push(`   Stories Validated: ${result.validatedStories}/${result.totalStories}`);
  lines.push(`   Average Score: ${result.averageScore}% (minimum: ${result.minimumScore}%)`);
  lines.push('   Quality Distribution:');
  lines.push(`     - Excellent (90-100): ${result.qualityDistribution.excellent}`);
  lines.push(`     - Good (80-89): ${result.qualityDistribution.good}`);
  lines.push(`     - Acceptable (70-79): ${result.qualityDistribution.acceptable}`);
  lines.push(`     - Poor (<70): ${result.qualityDistribution.poor}`);

  if (result.boilerplateCount > 0) {
    lines.push(`   ⚠️  Boilerplate Detected: ${result.boilerplateCount} stories`);
  }

  if (result.issues.length > 0) {
    lines.push(`   ❌ Blocking Issues: ${result.issues.length}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`   ⚠️  Warnings: ${result.warnings.length}`);
  }

  return lines.join('\n');
}

/**
 * Get improvement guidance for failed validation
 */
export function getUserStoryImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '30-60 minutes',
    instructions: ''
  };

  // Analyze issues
  const issueTypes = {
    title: validationResult.issues.filter(i => i.includes('Title')),
    userWant: validationResult.issues.filter(i => i.includes('user_want')),
    userBenefit: validationResult.issues.filter(i => i.includes('user_benefit')),
    acceptanceCriteria: validationResult.issues.filter(i => i.includes('acceptance criteria')),
    boilerplate: validationResult.issues.filter(i => i.includes('boilerplate'))
  };

  if (issueTypes.title.length > 0) {
    guidance.required.push(`Fix ${issueTypes.title.length} story titles (remove "undefined", add specificity)`);
  }

  if (issueTypes.userWant.length > 0) {
    guidance.required.push(`Expand ${issueTypes.userWant.length} user_want fields (minimum 20 chars, describe the feature)`);
  }

  if (issueTypes.userBenefit.length > 0) {
    guidance.required.push(`Add specific benefits to ${issueTypes.userBenefit.length} stories (what value does the user gain?)`);
  }

  if (issueTypes.acceptanceCriteria.length > 0) {
    guidance.required.push(`Add specific acceptance criteria to ${issueTypes.acceptanceCriteria.length} stories (minimum 2 per story)`);
  }

  if (issueTypes.boilerplate.length > 0) {
    guidance.required.push(`Replace boilerplate in ${issueTypes.boilerplate.length} stories with specific, testable criteria`);
  }

  // Recommendations from warnings
  const warningTypes = {
    genericRole: validationResult.warnings.filter(w => w.includes('Generic user_role')),
    noGWT: validationResult.warnings.filter(w => w.includes('Given-When-Then')),
    noContext: validationResult.warnings.filter(w => w.includes('implementation_context'))
  };

  if (warningTypes.genericRole.length > 0) {
    guidance.recommended.push(`Use specific personas instead of "user/developer" in ${warningTypes.genericRole.length} stories`);
  }

  if (warningTypes.noGWT.length > 0) {
    guidance.recommended.push('Add Given-When-Then format to acceptance criteria for better testability');
  }

  if (warningTypes.noContext.length > 0) {
    guidance.recommended.push('Add implementation_context with architecture references and code patterns');
  }

  // Time estimate based on issues
  const totalIssues = validationResult.issues.length;
  if (totalIssues <= 5) {
    guidance.timeEstimate = '15-30 minutes';
  } else if (totalIssues <= 15) {
    guidance.timeEstimate = '30-60 minutes';
  } else {
    guidance.timeEstimate = '1-2 hours';
  }

  guidance.instructions = `User story quality score is ${validationResult.averageScore}% (minimum ${validationResult.minimumScore}%). ` +
    'Focus on stories with score < 70. ' +
    'Use the stories-agent skill for guidance on INVEST criteria and Given-When-Then format.';

  return guidance;
}

export default {
  validateUserStoryQuality,
  validateUserStoriesForHandoff,
  getUserStoryImprovementGuidance
};
