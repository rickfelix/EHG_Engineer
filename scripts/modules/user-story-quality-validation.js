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

// Reserved for future role-based validation
const _GENERIC_ROLES = ['user', 'developer', 'admin', 'system'];

const GENERIC_BENEFITS = [
  'improve the system',
  'enhance functionality',
  'better user experience',
  'meet requirements',
  'have this capability'
];

/**
 * Fast heuristic validation (no AI calls) - checks structural quality
 * @param {Object} story - User story object from database
 * @returns {Object} { valid: boolean, passed: boolean, issues: array, warnings: array, score: number }
 */
function validateUserStoryHeuristic(story) {
  const storyKey = story?.story_key || story?.id || 'Unknown';
  const issues = [];
  const warnings = [];
  let score = 100;

  // Check title quality
  const title = story.title || '';
  if (title.length < 10) {
    issues.push(`${storyKey}: Title too short (${title.length} chars, min 10)`);
    score -= 15;
  }
  if (BOILERPLATE_TITLES.some(b => title.toLowerCase().includes(b))) {
    issues.push(`${storyKey}: Boilerplate title detected`);
    score -= 20;
  }

  // Check user_want
  const userWant = story.user_want || story.i_want || '';
  if (userWant.length < 20) {
    issues.push(`${storyKey}: user_want too short (${userWant.length} chars, min 20)`);
    score -= 15;
  }

  // Check user_benefit
  const userBenefit = story.user_benefit || story.so_that || '';
  if (userBenefit.length < 15) {
    warnings.push(`${storyKey}: user_benefit short (${userBenefit.length} chars)`);
    score -= 5;
  }
  if (GENERIC_BENEFITS.some(b => userBenefit.toLowerCase().includes(b))) {
    warnings.push(`${storyKey}: Generic benefit detected`);
    score -= 10;
  }

  // Check acceptance criteria
  const ac = story.acceptance_criteria || [];
  if (!Array.isArray(ac) || ac.length < 2) {
    issues.push(`${storyKey}: Insufficient acceptance criteria (${ac.length}, min 2)`);
    score -= 20;
  } else {
    // Check for boilerplate AC
    const boilerplateAC = ac.filter(criterion => {
      const text = typeof criterion === 'string' ? criterion : JSON.stringify(criterion);
      return BOILERPLATE_AC.some(b => text.toLowerCase().includes(b.toLowerCase()));
    });
    if (boilerplateAC.length > 0) {
      warnings.push(`${storyKey}: ${boilerplateAC.length} boilerplate acceptance criteria`);
      score -= 5 * boilerplateAC.length;
    }
  }

  // Check implementation_context
  const implContext = story.implementation_context || '';
  if (implContext.length < 20) {
    warnings.push(`${storyKey}: Missing/short implementation_context`);
    score -= 5;
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));
  const passed = score >= 65 && issues.length === 0;

  return {
    story_key: storyKey,
    valid: passed,
    passed,
    score,
    issues,
    warnings,
    details: { method: 'heuristic' }
  };
}

/**
 * Validate a single user story for quality using AI-powered Russian Judge rubric
 * Set STORY_VALIDATION_MODE=heuristic to use fast non-AI validation
 * @param {Object} story - User story object from database
 * @param {Object} options - Validation options
 * @param {string} options.sdType - SD type (infrastructure, bugfix, etc.) for type-aware validation
 * @returns {Promise<Object>} { valid: boolean, passed: boolean, issues: array, warnings: array, score: number }
 */
export async function validateUserStoryQuality(story, options = {}) {
  const storyKey = story?.story_key || story?.id || 'Unknown';
  const sdType = (options.sdType || '').toLowerCase();
  const sdCategory = (options.sdCategory || '').toLowerCase();

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

  // Use heuristic validation for simpler SDs (infrastructure, test-focused, etc.)
  // AI scoring is too strict for these SD types - database SDs focus on schema/migrations, not user narratives
  // Added 'theming', 'ux', 'design', 'ui' - these focus on visual/style fixes, not complex user narratives
  // Check both sdType and sdCategory since SDs can have type='implementation' but category='theming'
  const heuristicTypes = ['bugfix', 'bug_fix', 'fix', 'infrastructure', 'database', 'quality assurance', 'quality_assurance', 'orchestrator', 'documentation', 'theming', 'ux', 'design', 'ui', 'layout', 'state-management'];
  const usesHeuristic = process.env.STORY_VALIDATION_MODE === 'heuristic' ||
                        heuristicTypes.includes(sdType) ||
                        heuristicTypes.includes(sdCategory);

  if (usesHeuristic) {
    if (sdType) {
      console.log(`   ℹ️  Using heuristic story validation (sdType: ${sdType})`);
    }
    return validateUserStoryHeuristic(story);
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

    // Fallback to heuristic on AI failure
    console.log(`   Falling back to heuristic validation for ${storyKey}`);
    return validateUserStoryHeuristic(story);
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
    blockOnWarnings = false,
    sdType = '',  // Pass SD type to enable heuristic validation for infrastructure/database SDs
    sdCategory = ''  // Pass SD category (theming, ux, etc.) for heuristic validation
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

  // Validate stories with parallel processing for speed
  // PARALLEL_BATCH_SIZE controls how many stories are validated concurrently
  const PARALLEL_BATCH_SIZE = parseInt(process.env.AI_PARALLEL_BATCH_SIZE) || 3; // Default 3 concurrent
  const BATCH_DELAY_MS = parseInt(process.env.AI_BATCH_DELAY_MS) || 1000; // Delay between batches
  const DEBUG = process.env.AI_DEBUG === 'true';
  const validationStartTime = Date.now();
  let totalScore = 0;

  const isParallel = process.env.STORY_VALIDATION_MODE !== 'heuristic' && PARALLEL_BATCH_SIZE > 1;

  if (DEBUG || stories.length > 3) {
    console.log(`[UserStoryValidation] Starting validation of ${stories.length} stories`);
    console.log(`[UserStoryValidation] Mode: ${process.env.STORY_VALIDATION_MODE || 'AI (default)'}`);
    console.log(`[UserStoryValidation] Parallel: ${isParallel ? `Yes (batch size: ${PARALLEL_BATCH_SIZE})` : 'No (sequential)'}`);
  }

  // Process stories in parallel batches
  const allResults = [];

  for (let batchStart = 0; batchStart < stories.length; batchStart += PARALLEL_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, stories.length);
    const batch = stories.slice(batchStart, batchEnd);
    const batchNum = Math.floor(batchStart / PARALLEL_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stories.length / PARALLEL_BATCH_SIZE);

    // Add delay between batches (skip for first batch)
    if (batchStart > 0 && isParallel) {
      if (DEBUG) console.log(`[UserStoryValidation] Waiting ${BATCH_DELAY_MS}ms between batches...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }

    if (DEBUG) {
      console.log(`[UserStoryValidation] Processing batch ${batchNum}/${totalBatches} (stories ${batchStart + 1}-${batchEnd})`);
    }

    const batchStartTime = Date.now();

    // Process batch in parallel
    const batchPromises = batch.map(async (story, idx) => {
      const storyKey = story.story_key || story.id || `Story-${batchStart + idx + 1}`;
      const storyStartTime = Date.now();

      try {
        const storyResult = await validateUserStoryQuality(story, { sdType, sdCategory });
        const storyDuration = Date.now() - storyStartTime;

        return {
          success: true,
          storyKey,
          storyResult,
          storyDuration,
          index: batchStart + idx
        };
      } catch (error) {
        console.error(`[UserStoryValidation] Error validating ${storyKey}: ${error.message}`);
        return {
          success: false,
          storyKey,
          storyResult: {
            score: 0,
            passed: false,
            issues: [`Validation error: ${error.message}`],
            warnings: []
          },
          storyDuration: Date.now() - storyStartTime,
          index: batchStart + idx
        };
      }
    });

    // Wait for all stories in batch to complete
    const batchResults = await Promise.all(batchPromises);
    const batchDuration = Date.now() - batchStartTime;

    // Process results
    for (const { storyKey, storyResult, storyDuration, index } of batchResults) {
      allResults.push({ storyKey, storyResult, storyDuration, index });
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

    // Batch progress indicator
    const elapsed = Math.round((Date.now() - validationStartTime) / 1000);
    const remaining = stories.length - batchEnd;
    const avgTimePerStory = elapsed / batchEnd;
    const eta = Math.round(avgTimePerStory * remaining);

    const batchScores = batchResults.map(r => `${r.storyResult.score}%`).join(', ');
    console.log(`   [Batch ${batchNum}/${totalBatches}] ${batch.length} stories: ${batchScores} (${batchDuration}ms)${remaining > 0 ? ` - ETA: ${eta}s` : ''}`);
  }

  const totalDuration = Date.now() - validationStartTime;
  if (DEBUG || stories.length > 3) {
    const speedup = isParallel ? ` (~${PARALLEL_BATCH_SIZE}x speedup)` : '';
    console.log(`[UserStoryValidation] Completed ${stories.length} stories in ${Math.round(totalDuration / 1000)}s${speedup}`);
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
